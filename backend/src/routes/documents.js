'use strict';

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const upload = require('../middleware/upload');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { computeHashes } = require('../services/hashingService');
const blockchain = require('../services/blockchainService');
const { indexDocument, removeFromIndex, updateIndex } = require('../services/searchService');
const { registerFile, getFileInfo, getUploadDir, listVersionFiles, addVersionFile } = require('../services/storageService');
const DocumentPublication = require('../models/DocumentPublication');
const publication = require('../services/publicationService');
const { extractText, compareContent, sameFileName } = require('../services/contentService');
const { computeMetadataHash } = require('../services/metadataService');
const integrity = require('../services/integrityService');
const tor = require('../services/torService');
const fileMatch = require('../services/fileMatchService');

// Compare MD5, SHA-1 and SHA-256 of a file with the three hashes stored on
// the ledger. The tamper decision itself uses SHA-256 (in the chaincode);
// this shows the result for each algorithm side by side.
function compareAllHashes(ledgerHashes, filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const computed = computeHashes(filePath);
  const stored = ledgerHashes || {};
  return ['md5', 'sha1', 'sha256'].map(algorithm => ({
    algorithm,
    label: { md5: 'MD5', sha1: 'SHA-1', sha256: 'SHA-256' }[algorithm],
    stored: stored[algorithm] || null,
    computed: computed[algorithm],
    match: stored[algorithm] ? stored[algorithm] === computed[algorithm] : null,
  }));
}

// ─── POST /api/documents/upload ──────────────────────────────────
router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const { department, docType, tags } = req.body;
    const { isPublic, isConfidential, title, resolutionNumber, resolutionDate, summary, recordYear, recordQuarter } = req.body;
    if (isPublic === 'true' && isConfidential === 'true') {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Confidential documents cannot be published on the public page.' });
    }
    const docId = uuidv4();
    const filePath = req.file.path;

    // Compute MD5, SHA-1, SHA-256
    const hashes = computeHashes(filePath);

    // Hash the key database fields (title, classification, owner) so the
    // ledger can later detect edits made directly in PostgreSQL
    const pubFields = { isPublic, isConfidential, title, resolutionNumber, resolutionDate, summary, recordYear, recordQuarter };
    // Year / quarter the document is filed under (checked before anything is registered)
    let filing;
    try {
      filing = publication.buildRecord({ docId, filename: req.file.originalname, status: 'active' }, pubFields, req.user.username);
    } catch (e) {
      fs.unlink(req.file.path, () => {});
      return res.status(e.status || 400).json({ error: e.message });
    }
    const metadataHash = computeMetadataHash(publication.buildRecord({
      docId,
      filename: req.file.originalname,
      department: tor.office(department),
      docType: tor.docType(docType),
      uploader: req.user.username,
      status: 'active',
      hashes,
    }, pubFields, req.user.username));

    // Register on blockchain: doc ID, file hashes, metadata hash, uploader;
    // the timestamp is the transaction time set by the network
    const ledgerRecord = await blockchain.registerDocument({
      docId,
      filename: req.file.originalname,
      md5: hashes.md5,
      sha1: hashes.sha1,
      sha256: hashes.sha256,
      uploader: req.user.username,
      department: tor.office(department),
      docType: tor.docType(docType),
      metadataHash,
    });

    // Save file mapping (docId -> stored filename)
    registerFile(docId, req.file.filename, req.file.originalname, req.user.username);

    // Extract text content for full-text search
    let content = req.file.originalname;
    try {
      content = (await extractText(fs.readFileSync(filePath), req.file.originalname)) || content;
    } catch (e) {
      console.log('[Search] Text extraction failed:', e.message);
      content = req.file.originalname;
    }

    await indexDocument({
      docId,
      filename: req.file.originalname,
      content,
      department: tor.office(department),
      docType: tor.docType(docType),
      uploader: req.user.username,
      registeredAt: new Date().toISOString(),
      tags: [
        ...(tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : []),
        // so a search for "2026 Q3" or "Q3" finds documents filed there
        ...(filing.recordYear && filing.recordQuarter ? [String(filing.recordYear), `Q${filing.recordQuarter}`, `${filing.recordYear} Q${filing.recordQuarter}`, `Quarter ${filing.recordQuarter}`, `${filing.recordYear} Quarter ${filing.recordQuarter}`] : []),
      ],
    });

    // Public page settings (off by default). The upload already succeeded,
    // so a failure here is reported but does not undo the registration.
    let publicationRecord = null;
    let publicationError = null;
    try {
      publicationRecord = await publication.savePublication(ledgerRecord, pubFields, req.user.username);
    } catch (e) {
      console.error('[Publication Error]', e.message);
      publicationError = e.message;
    }

    await integrity.logVerification({
      docId,
      filename: req.file.originalname,
      action: 'register',
      result: 'pass',
      fileIntact: true,
      metadataIntact: true,
      expectedHash: hashes.sha256,
      computedHash: hashes.sha256,
      expectedMetadataHash: metadataHash,
      computedMetadataHash: metadataHash,
      ledgerRecorded: true,
      message: 'SHA-256 and metadata hash registered on the blockchain.',
      actor: req.user.username,
      ip: req.ip,
    });

    res.status(201).json({
      message: 'Document uploaded and registered on blockchain.',
      docId,
      filename: req.file.originalname,
      hashes,
      ledgerRecord,
      publication: publicationRecord,
      publicationError,
    });
  } catch (err) {
    console.error('[Upload Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/documents ───────────────────────────────────────────
// Admin: all documents | User: only their own
router.get('/', authenticate, async (req, res) => {
  try {
    const documents = await blockchain.getAllDocuments();
    if (req.user.role === 'admin') {
      return res.json({ documents });
    }
    // Regular users only see their own
    const own = documents.filter(d => d.uploader === req.user.username);
    res.json({ documents: own });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/documents/:id ───────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  try {
    const doc = await blockchain.getDocument(req.params.id);
    // Users can only view their own documents
    if (req.user.role !== 'admin' && doc.uploader !== req.user.username) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    res.json({ document: doc });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// ─── GET /api/documents/:id/download[?inline=1][&override=1] ─────
// Admin: any file | User: only their own uploaded files
// The stored file and its metadata are re-hashed and checked against the
// ledger (chaincode VerifyDocument) before every download or view. A tampered
// document is blocked; an admin can still fetch it with override=1 to investigate.
router.get('/:id/download', authenticate, async (req, res) => {
  try {
    const docId = req.params.id;
    const inline = req.query.inline === '1';

    // Get ledger record to check uploader
    const ledgerDoc = await blockchain.getDocument(docId);

    // Permission check
    if (req.user.role !== 'admin' && ledgerDoc.uploader !== req.user.username) {
      return res.status(403).json({ error: 'Access denied. You can only download your own documents.' });
    }

    // Get stored filename from mapping
    const fileInfo = getFileInfo(docId);
    if (!fileInfo) {
      return res.status(404).json({ error: 'File not found on server. It may have been uploaded before file tracking was enabled.' });
    }

    const override = req.query.override === '1' && req.user.role === 'admin';
    const check = await integrity.checkStoredDocument(docId, {
      action: inline ? 'view' : 'download',
      actor: req.user.username,
      req,
      ledgerDoc,
      blockOnFail: !override,
    });

    if (check.status === 'error') {
      return res.status(503).json({ error: `${check.message} The file is not served until its integrity can be checked.`, integrity: 'error' });
    }
    if (check.status === 'fail' && !override) {
      return res.status(409).json({
        error: `TAMPERED — ${check.message}`,
        tampered: true,
        reasons: check.reasons,
        expectedHash: check.expectedHash,
        computedHash: check.computedHash,
        canOverride: req.user.role === 'admin' && !!check.filePath,
      });
    }

    const filePath = path.join(getUploadDir(), fileInfo.storedFilename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk.' });
    }

    res.setHeader('X-DocuChain-Integrity', check.status === 'fail' ? 'tampered' : 'intact');
    res.setHeader('Access-Control-Expose-Headers', 'X-DocuChain-Integrity');
    if (inline) {
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileInfo.originalFilename)}"`);
      return res.sendFile(filePath);
    }
    // Send file with original filename
    res.download(filePath, fileInfo.originalFilename);
  } catch (err) {
    console.error('[Download Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Verification of an uploaded copy ────────────────────────────
// Compares a file someone has with the ledger record of a document. The
// record itself is not flagged because a copy differs. The database metadata
// of the document is checked too.
// `identification` (from fileMatchService) says how the document was found
// when no ID was given; a changed copy is compared with the version it
// resembles most.
async function verifyCopy(req, ledgerDoc, identification = null) {
  const docId = ledgerDoc.docId;
  const buffer = fs.readFileSync(req.file.path);
  const currentHash = computeHashes(req.file.path).sha256;
  let metadataHash = '';
  if (ledgerDoc.metadataHash && ledgerDoc.status === 'active') {
    const row = await publication.getRecord(docId);
    metadataHash = row ? computeMetadataHash(row) : 'missing';
  }

  const verificationResult = await blockchain.verifyDocument(docId, {
    sha256: currentHash,
    metadataHash,
    source: 'copy',
    checkedBy: req.user.username,
    context: 'verify',
  });

  // Hash differs from the current version: is it an older registered version?
  let versionCheck = null;
  if (!verificationResult.fileIntact) {
    const history = ledgerDoc.versionHistory || [];
    const match = history.find(v => v.sha256Hash === currentHash);
    if (match) versionCheck = { matchesVersion: match.version, currentVersion: history.length, updatedAt: match.updatedAt, updatedBy: match.updatedBy };
  }

  // File bytes differ: check whether the text itself was changed, or only
  // the file was re-created (e.g. content copy-pasted into a new document).
  // Compared with the version the file resembles most (normally the current one).
  let contentCheck = null;
  if (!verificationResult.fileIntact && !versionCheck) {
    const d = identification?.document;
    const olderVersion = d && d.docId === docId && !d.isCurrent && d.storedFilename;
    contentCheck = olderVersion
      ? await compareContent(docId, d.sha256, buffer, req.file.originalname, { storedFilename: d.storedFilename, originalFilename: d.versionFilename || ledgerDoc.filename })
      : await compareContent(docId, ledgerDoc.hashes.sha256, buffer, req.file.originalname);
    if (olderVersion) contentCheck.comparedWithVersion = d.version;
  }

  // A changed file name doesn't change the hash, but it is flagged for
  // confirmation so a renamed copy isn't passed off silently. An older
  // version keeps the name it was registered with.
  const registeredName = versionCheck
    ? (listVersionFiles(docId).find(f => f.version === versionCheck.matchesVersion)?.originalFilename || ledgerDoc.filename)
    : ledgerDoc.filename;
  const renamed = !sameFileName(registeredName, req.file.originalname);
  const nameCheck = { registeredName, providedName: req.file.originalname, renamed };
  const metadataTampered = verificationResult.metadataIntact === false;

  let message = '⚠ TAMPER DETECTED';
  let result = 'fail';
  if (verificationResult.fileIntact && metadataTampered) message = 'File is INTACT, but the document details in the database were changed outside DocuChain';
  else if (verificationResult.fileIntact && renamed) { message = 'Content INTACT, but the file name was changed — waiting for confirmation'; result = 'warning'; }
  else if (verificationResult.fileIntact) { message = 'Document integrity verified — INTACT'; result = 'pass'; }
  else if (versionCheck) { message = `OUTDATED VERSION — this file is version ${versionCheck.matchesVersion}; the current version is ${versionCheck.currentVersion}`; result = 'warning'; }
  else if (contentCheck?.status === 'identical') { message = 'File differs from the original, but its text content is identical'; result = 'warning'; }
  else if (identification) message = `⚠ TAMPER DETECTED — this looks like an altered copy of "${ledgerDoc.filename}"`;

  const reasons = [];
  if (!verificationResult.fileIntact) reasons.push(versionCheck ? 'outdated_version' : 'copy_differs');
  if (renamed) reasons.push('renamed');
  if (metadataTampered) reasons.push('metadata');
  const how = identification
    ? (identification.match === 'exact' ? ' (found by its hash)' : identification.matchedBy === 'content' ? ` (found by text similarity ${Math.round((identification.similarity || 0) * 100)}%)` : ' (found by its file name)')
    : '';
  await integrity.logVerification({
    docId,
    filename: ledgerDoc.filename,
    action: 'verify',
    result,
    fileIntact: verificationResult.fileIntact,
    metadataIntact: verificationResult.metadataIntact,
    reasons,
    expectedHash: verificationResult.storedHash,
    computedHash: currentHash,
    expectedMetadataHash: verificationResult.storedMetadataHash,
    computedMetadataHash: metadataHash.length === 64 ? metadataHash : null,
    ledgerRecorded: !!verificationResult.recorded,
    message: `Uploaded copy "${req.file.originalname}"${how}: ${message}`,
    actor: req.user.username,
    ip: req.ip,
  });
  if (metadataTampered && verificationResult.recorded) {
    integrity.notifyAdmins({ docId, filename: ledgerDoc.filename, action: 'verify', reasons: ['metadata'] }).catch(() => {});
  }

  return {
    message,
    ...verificationResult,
    checkedStoredCopy: false,
    integrityStatus: result,
    metadataCheck: { anchored: !!verificationResult.metadataAnchored, intact: verificationResult.metadataIntact, storedHash: verificationResult.storedMetadataHash, computedHash: verificationResult.providedMetadataHash },
    contentCheck,
    nameCheck,
    versionCheck,
    hashComparison: compareAllHashes(ledgerDoc.hashes, req.file.path),
  };
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

// ─── POST /api/documents/verify ──────────────────────────────────
// Upload only: no document ID needed. The file is hashed and looked up among
// all registered documents and their versions; if nothing matches exactly,
// the most similar registered document is reported as the likely original.
router.post('/verify', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Choose the file you want to verify.' });

    let documents;
    try {
      documents = await withTimeout(blockchain.getAllDocuments(), 15000, 'Ledger request timed out.');
    } catch (err) {
      return res.status(503).json({ error: `The blockchain network could not be reached (${err.message}). Try again once it is running.` });
    }

    const identification = await fileMatch.identify({
      buffer: fs.readFileSync(req.file.path),
      filename: req.file.originalname,
      documents,
    });

    if (identification.match === 'none') {
      const message = 'NOT REGISTERED — this file does not match any document on the blockchain, and no registered document has similar content or the same file name.';
      await integrity.logVerification({
        docId: null,
        filename: req.file.originalname,
        action: 'verify',
        result: 'fail',
        fileIntact: false,
        reasons: ['not_registered'],
        computedHash: identification.hashes.sha256,
        message: `Uploaded file "${req.file.originalname}": not registered (checked ${identification.checked} documents).`,
        actor: req.user.username,
        ip: req.ip,
      });
      return res.json({
        message,
        notRegistered: true,
        integrityStatus: 'fail',
        isIntact: false,
        providedHash: identification.hashes.sha256,
        providedHashes: identification.hashes,
        nameCheck: { providedName: req.file.originalname },
        identification,
        verifiedAt: new Date().toISOString(),
      });
    }

    const ledgerDoc = documents.find(d => d.docId === identification.document.docId);
    const payload = await verifyCopy(req, ledgerDoc, identification);
    res.json({ ...payload, identification, document: ledgerDoc });
  } catch (err) {
    console.error('[Verify Error]', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    // The file uploaded for verification is not registered, so don't keep it
    if (req.file) fs.unlink(req.file.path, () => {});
  }
});

// ─── POST /api/documents/:id/verify ──────────────────────────────
// Advanced option: check against one document by its ID.
// With a file: compare that copy with the ledger. Without a file: check the
// copy stored on the server.
router.post('/:id/verify', authenticate, upload.single('file'), async (req, res) => {
  try {
    const docId = req.params.id;
    const ledgerDoc = await blockchain.getDocument(docId);

    if (!req.file) {
      const check = await integrity.checkStoredDocument(docId, { action: 'verify', actor: req.user.username, req, ledgerDoc });
      if (check.status === 'error') return res.status(503).json({ error: check.message });
      const v = check.ledger || {};
      let message = check.status === 'fail' ? `⚠ TAMPERED — ${check.message}` : check.message;
      return res.json({
        message,
        ...v,
        checkedStoredCopy: true,
        integrityStatus: check.status,
        isIntact: check.status !== 'fail' && v.fileIntact !== false,
        reasons: check.reasons,
        metadataCheck: { anchored: !!v.metadataAnchored, intact: v.metadataIntact, storedHash: v.storedMetadataHash, computedHash: v.providedMetadataHash },
        contentCheck: null,
        nameCheck: null,
        hashComparison: (() => {
          try {
            const info = getFileInfo(docId);
            return info ? compareAllHashes(ledgerDoc.hashes, path.join(getUploadDir(), info.storedFilename)) : null;
          } catch { return null; }
        })(),
        document: ledgerDoc,
      });
    }

    const payload = await verifyCopy(req, ledgerDoc);
    res.json({ ...payload, document: ledgerDoc });
  } catch (err) {
    console.error('[Verify Error]', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    // The file uploaded for verification is not registered, so don't keep it
    if (req.file) fs.unlink(req.file.path, () => {});
  }
});

// ─── Document versions ───────────────────────────────────────────
// Every version's SHA-256 is kept on the ledger (versionHistory, written by
// the chaincode's UpdateDocument). The files of older versions stay on the
// server, so each one can still be downloaded and checked against its hash.

function canAccess(user, ledgerDoc) {
  return user.role === 'admin' || ledgerDoc.uploader === user.username;
}

// Ledger version history joined with the stored files
function buildVersions(ledgerDoc) {
  const files = listVersionFiles(ledgerDoc.docId);
  const history = ledgerDoc.versionHistory && ledgerDoc.versionHistory.length
    ? ledgerDoc.versionHistory
    : [{ version: 1, sha256Hash: ledgerDoc.hashes?.sha256, updatedAt: ledgerDoc.registeredAt, updatedBy: ledgerDoc.uploader }];
  const current = history.length;
  return history.map(v => {
    const file = files.find(f => f.version === v.version) || null;
    return {
      version: v.version,
      sha256: v.sha256Hash,
      updatedAt: v.updatedAt,
      updatedBy: v.updatedBy,
      filename: file?.originalFilename || (v.version === current ? ledgerDoc.filename : null),
      fileAvailable: !!file,
      isCurrent: v.version === current,
      // MD5 / SHA-1 are on the ledger for the current version only
      hashes: v.version === current ? ledgerDoc.hashes : { sha256: v.sha256Hash },
    };
  });
}

// ─── GET /api/documents/:id/versions ─────────────────────────────
router.get('/:id/versions', authenticate, async (req, res) => {
  try {
    const ledgerDoc = await blockchain.getDocument(req.params.id);
    if (!canAccess(req.user, ledgerDoc)) return res.status(403).json({ error: 'Access denied.' });
    const versions = buildVersions(ledgerDoc);
    // Year / quarter the document is filed under in the Repository
    const pubRow = await DocumentPublication.findByPk(ledgerDoc.docId).catch(() => null);
    const filing = pubRow?.recordYear ? { recordYear: pubRow.recordYear, recordQuarter: pubRow.recordQuarter, resolutionNumber: pubRow.resolutionNumber, resolutionDate: pubRow.resolutionDate } : null;
    res.json({ document: ledgerDoc, currentVersion: versions.length, versions, filing });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// ─── POST /api/documents/:id/versions ────────────────────────────
// Upload a new version. The ledger keeps the old hash in the version history
// and the new MD5 / SHA-1 / SHA-256 become the document's current hashes.
router.post('/:id/versions', authenticate, upload.single('file'), async (req, res) => {
  const docId = req.params.id;
  let keepFile = false;
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const ledgerDoc = await blockchain.getDocument(docId);
    if (!canAccess(req.user, ledgerDoc)) return res.status(403).json({ error: 'Only the owner or an administrator can upload a new version.' });
    if (ledgerDoc.status !== 'active') return res.status(400).json({ error: 'This document is deactivated.' });
    if (!getFileInfo(docId)) return res.status(400).json({ error: 'The current file of this document is not on the server.' });

    const hashes = computeHashes(req.file.path);
    if (hashes.sha256 === ledgerDoc.hashes?.sha256) {
      return res.status(400).json({ error: 'This file is identical to the current version.' });
    }
    const previous = (ledgerDoc.versionHistory || []).find(v => v.sha256Hash === hashes.sha256);

    const updated = await blockchain.updateDocument({
      docId,
      filename: req.file.originalname,
      md5: hashes.md5,
      sha1: hashes.sha1,
      sha256: hashes.sha256,
      updatedBy: req.user.username,
    });
    const newVersion = updated.versionHistory?.length || ((ledgerDoc.versionHistory || []).length + 1);
    keepFile = true;
    addVersionFile(docId, {
      version: newVersion,
      storedFilename: req.file.filename,
      originalFilename: req.file.originalname,
      uploadedBy: req.user.username,
      sha256: hashes.sha256,
    });

    // Search index: the text of the newest version
    try {
      let content = req.file.originalname;
      try { content = (await extractText(fs.readFileSync(req.file.path), req.file.originalname)) || content; } catch { /* keep file name */ }
      await updateIndex(docId, { filename: req.file.originalname, content });
    } catch (e) {
      console.log('[Search] Could not update index for new version:', e.message);
    }

    // Public page / publishing list show the newest file name
    // (and its SHA-256, used when the ledger is offline; not part of the metadata hash)
    try { await DocumentPublication.update({ filename: req.file.originalname, sha256: hashes.sha256 }, { where: { docId } }); } catch { /* no publication row */ }

    await integrity.logVerification({
      docId,
      filename: req.file.originalname,
      action: 'new_version',
      result: 'pass',
      fileIntact: true,
      expectedHash: hashes.sha256,
      computedHash: hashes.sha256,
      ledgerRecorded: true,
      message: `Version ${newVersion} registered on the blockchain (previous SHA-256 ${String(ledgerDoc.hashes?.sha256 || '').slice(0, 12)}…).`,
      actor: req.user.username,
      ip: req.ip,
    });

    res.status(201).json({
      message: `Version ${newVersion} registered on the blockchain.`,
      version: newVersion,
      hashes,
      sameAsVersion: previous ? previous.version : null,
      document: updated,
      versions: buildVersions(updated),
    });
  } catch (err) {
    console.error('[New Version Error]', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (req.file && !keepFile) fs.unlink(req.file.path, () => {});
  }
});

// ─── GET /api/documents/:id/versions/:version/download[?inline=1][&override=1]
// The file of that version is re-hashed and compared with the SHA-256 the
// ledger holds for that version before it is served.
router.get('/:id/versions/:version/download', authenticate, async (req, res) => {
  try {
    const docId = req.params.id;
    const versionNo = parseInt(req.params.version);
    const inline = req.query.inline === '1';
    const ledgerDoc = await blockchain.getDocument(docId);
    if (!canAccess(req.user, ledgerDoc)) return res.status(403).json({ error: 'Access denied.' });

    const entry = buildVersions(ledgerDoc).find(v => v.version === versionNo);
    const file = listVersionFiles(docId).find(f => f.version === versionNo);
    if (!entry) return res.status(404).json({ error: `Version ${versionNo} does not exist.` });
    if (!file) return res.status(404).json({ error: `The file of version ${versionNo} is not on the server.` });
    const filePath = path.join(getUploadDir(), file.storedFilename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk.' });

    const computed = computeHashes(filePath).sha256;
    const intact = computed === entry.sha256;
    const override = req.query.override === '1' && req.user.role === 'admin';
    await integrity.logVerification({
      docId,
      filename: file.originalFilename,
      action: inline ? 'view' : 'download',
      result: intact ? 'pass' : 'fail',
      fileIntact: intact,
      reasons: intact ? [] : ['file'],
      expectedHash: entry.sha256,
      computedHash: computed,
      blocked: !intact && !override,
      message: `Version ${versionNo}${entry.isCurrent ? ' (current)' : ''}: ${intact ? 'SHA-256 matches the ledger.' : 'SHA-256 does NOT match the ledger.'}`,
      actor: req.user.username,
      ip: req.ip,
    });
    if (!intact && !override) {
      return res.status(409).json({
        error: `TAMPERED — version ${versionNo} no longer matches its hash on the blockchain.`,
        tampered: true,
        reasons: ['file'],
        expectedHash: entry.sha256,
        computedHash: computed,
        canOverride: req.user.role === 'admin',
      });
    }

    res.setHeader('X-DocuChain-Integrity', intact ? 'intact' : 'tampered');
    res.setHeader('Access-Control-Expose-Headers', 'X-DocuChain-Integrity');
    if (inline) {
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalFilename)}"`);
      return res.sendFile(filePath);
    }
    res.download(filePath, file.originalFilename);
  } catch (err) {
    console.error('[Version Download Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/documents/:id/history ──────────────────────────────
router.get('/:id/history', authenticate, async (req, res) => {
  try {
    const history = await blockchain.getDocumentHistory(req.params.id);
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/documents/:id ────────────────────────────────────
// Admin only
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await blockchain.deactivateDocument(req.params.id, req.user.username);
    await removeFromIndex(req.params.id);
    await publication.hideDocument(req.params.id);
    res.json({ message: 'Document deactivated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;