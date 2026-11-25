'use strict';

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const { hashBuffer } = require('../services/hashingService');
const blockchain = require('../services/blockchainService');
const publication = require('../services/publicationService');
const { getFileInfo, getUploadDir } = require('../services/storageService');
const { compareContent, sameFileName } = require('../services/contentService');
const integrity = require('../services/integrityService');
const fileMatch = require('../services/fileMatchService');

/**
 * Public resolutions — no login required.
 * Only documents marked public (and never confidential) are reachable here.
 * Views, downloads and verifications are audit-logged in PostgreSQL.
 * Every file served is first re-hashed and checked against the ledger; the
 * only ledger write a visitor can cause is the chaincode recording that a
 * stored document was found tampered (once, when its status changes).
 */

// Verification uploads stay in memory and are discarded after hashing
const verifyUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 50) * 1024 * 1024 },
});

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Ledger request timed out.')), ms)),
  ]);
}

// ─── GET /api/public/resolutions?q=&year=&quarter=&category=&type=&sort=&page= ──────────────────
router.get('/resolutions', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const result = await publication.listPublic({
      q: req.query.q, year: req.query.year, quarter: req.query.quarter, category: req.query.category,
      type: req.query.type, sort: req.query.sort, page, limit,
    });
    res.json(result);
  } catch (err) {
    console.error('[Public Error]', err.message);
    res.status(500).json({ error: 'Could not load resolutions.' });
  }
});

// ─── GET /api/public/resolutions/:id ─────────────────────────────
router.get('/resolutions/:id', async (req, res) => {
  try {
    const pub = await publication.getPublic(req.params.id);
    if (!pub) return res.status(404).json({ error: 'Resolution not found.' });
    res.json({ resolution: publication.toPublicView(pub) });
  } catch (err) {
    res.status(500).json({ error: 'Could not load resolution.' });
  }
});

// ─── GET /api/public/resolutions/:id/file?mode=view|download|preview
router.get('/resolutions/:id/file', async (req, res) => {
  try {
    const pub = await publication.getPublic(req.params.id);
    if (!pub) return res.status(404).json({ error: 'Resolution not found.' });

    const fileInfo = getFileInfo(pub.docId);
    const filePath = fileInfo && path.join(getUploadDir(), fileInfo.storedFilename);
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not available.' });
    }

    const mode = ['download', 'preview'].includes(req.query.mode) ? req.query.mode : 'view';

    // Integrity check before serving. Thumbnails are checked too, but only
    // logged when they fail, so the list page doesn't flood the audit trail.
    const check = await integrity.checkStoredDocument(pub.docId, {
      action: `public_${mode}`,
      actor: 'public',
      req,
      log: mode !== 'preview',
      blockOnFail: true,
    });

    let integrityResult = check.status;
    if (check.status === 'error') {
      // Ledger offline: fall back to the hash copied into PostgreSQL at
      // publication time, and say so in the log
      const sameAsPublished = !!pub.sha256 && check.computedHash === pub.sha256;
      integrityResult = sameAsPublished ? 'unverified' : 'fail';
      await integrity.logVerification({
        docId: pub.docId, filename: pub.filename, action: `public_${mode}`,
        result: integrityResult, fileIntact: sameAsPublished, expectedHash: pub.sha256,
        computedHash: check.computedHash && check.computedHash.length === 64 ? check.computedHash : null,
        blocked: !sameAsPublished,
        message: `Ledger unreachable (${check.errorMessage}); compared with the published hash instead.`,
        actor: 'public', ip: req.ip,
      });
    } else if (check.status === 'fail' && mode === 'preview') {
      await integrity.logVerification({
        docId: pub.docId, filename: pub.filename, action: 'public_preview', result: 'fail',
        fileIntact: check.fileIntact, metadataIntact: check.metadataIntact, reasons: check.reasons,
        expectedHash: check.expectedHash, computedHash: check.computedHash && check.computedHash.length === 64 ? check.computedHash : null,
        ledgerRecorded: check.ledgerRecorded, blocked: true, message: check.message, actor: 'public', ip: req.ip,
      });
    }

    if (mode !== 'preview') {
      await publication.logPublicAccess(req, { action: mode, docId: pub.docId, result: integrityResult === 'fail' ? 'blocked_tampered' : 'served' });
    }

    if (integrityResult === 'fail') {
      const message = 'This document failed its blockchain integrity check and has been withheld. The issuing office has been notified.';
      if (mode === 'view' && (req.get('accept') || '').includes('text/html')) {
        return res.status(409).type('html').send(`<!doctype html><meta charset="utf-8"><title>Document withheld</title>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 16px;color:#1f2937">
<h1 style="color:#ce3d45;font-size:22px">⚠ Tampered document withheld</h1><p>${message}</p>
<p><a href="/public">Back to public resolutions</a></p></body>`);
      }
      return res.status(409).json({ error: message, tampered: true });
    }

    if (mode === 'download') return res.download(filePath, fileInfo.originalFilename);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileInfo.originalFilename)}"`);
    res.sendFile(filePath);
  } catch (err) {
    console.error('[Public File Error]', err.message);
    res.status(500).json({ error: 'Could not open file.' });
  }
});

// ─── POST /api/public/verify ─────────────────────────────────────
// Body: file (multipart) or sha256; docId is optional (advanced).
// Without an ID the file is looked up among the PUBLISHED resolutions only
// (never confidential ones): by its hash, including older versions, then by
// text similarity, then by file name, so an edited copy is reported as an
// altered copy of the resolution it came from.
router.post('/verify', verifyUpload.single('file'), async (req, res) => {
  try {
    let providedHash;
    if (req.file) {
      providedHash = hashBuffer(req.file.buffer, 'sha256');
    } else if (/^[a-fA-F0-9]{64}$/.test(req.body.sha256 || '')) {
      providedHash = req.body.sha256.toLowerCase();
    } else {
      return res.status(400).json({ error: 'Upload the file you want to verify, or paste its SHA-256 hash.' });
    }

    const docId = (req.body.docId || '').trim();
    const pubs = docId ? [await publication.getPublic(docId)].filter(Boolean) : await publication.listAllPublic();
    if (docId && !pubs.length) {
      await publication.logPublicAccess(req, { action: 'verify', docId: null, result: 'unknown_resolution', providedHash });
      return res.status(404).json({ error: 'No public resolution has that ID.' });
    }

    // Ledger records of the published resolutions (with their version
    // history). If the network is down, the hash copied into PostgreSQL at
    // publication time is used instead, and the result says so.
    let ledgerChecked = false;
    let documents;
    try {
      const ids = new Set(pubs.map(p => p.docId));
      const all = docId
        ? [await withTimeout(blockchain.getDocument(docId), 6000)]
        : await withTimeout(blockchain.getAllDocuments(), 8000);
      documents = all.filter(d => d && ids.has(d.docId) && d.status === 'active');
      ledgerChecked = true;
    } catch (err) {
      console.log('[Public Verify] Ledger lookup skipped:', err.message);
      documents = pubs.map(p => ({ docId: p.docId, filename: p.filename, hashes: { sha256: p.sha256 }, status: 'active' }));
    }

    const identification = await fileMatch.identify({
      buffer: req.file ? req.file.buffer : null,
      filename: req.file ? req.file.originalname : null,
      sha256: providedHash,
      documents,
    });

    // With an ID, that resolution is the one checked even if nothing matched
    let found = identification.document || null;
    if (!found && docId && documents[0]) {
      const versions = fileMatch.ledgerVersions(documents[0]);
      const cur = versions[versions.length - 1];
      found = { docId, isCurrent: true, version: cur.version, currentVersion: versions.length, sha256: cur.sha256, storedFilename: cur.storedFilename, versionFilename: cur.filename };
    }

    if (!found) {
      await publication.logPublicAccess(req, { action: 'verify', result: 'not_found', providedHash });
      return res.json({
        result: 'not_found',
        message: req.file
          ? 'This file does not match any published resolution, and no published resolution has similar content or the same file name. It was never published here, or it was changed beyond recognition.'
          : 'No published resolution has this SHA-256 hash.',
        providedHash,
        checkedCount: identification.checked,
        ledgerChecked,
        checkedAt: new Date().toISOString(),
      });
    }

    const pub = pubs.find(p => p.docId === found.docId);
    const ledgerDoc = documents.find(d => d.docId === found.docId);

    // Read-only chaincode check against the current version (evaluated, never submitted)
    let ledgerHash = null;
    if (ledgerChecked) {
      try {
        const verdict = await withTimeout(blockchain.verifyDocument(pub.docId, {
          sha256: providedHash, source: 'copy', checkedBy: 'public', context: 'public_verify', record: false,
        }), 6000);
        ledgerHash = verdict.storedHash || ledgerDoc?.hashes?.sha256 || null;
      } catch (err) {
        console.log('[Public Verify] Chaincode check skipped:', err.message);
        ledgerHash = ledgerDoc?.hashes?.sha256 || null;
      }
    }

    const expectedHash = ledgerChecked ? ledgerHash : pub.sha256;
    const authentic = !!expectedHash && expectedHash === providedHash;
    // Matches an older registered version exactly: genuine, but superseded
    const outdated = !authentic && identification.match === 'exact' && !found.isCurrent;

    // Not the same file: was the text changed, or only the file re-created?
    let contentCheck = null;
    if (!authentic && !outdated && req.file && found.sha256) {
      contentCheck = found.isCurrent
        ? await compareContent(pub.docId, expectedHash || found.sha256, req.file.buffer, req.file.originalname)
        : await compareContent(pub.docId, found.sha256, req.file.buffer, req.file.originalname, { storedFilename: found.storedFilename, originalFilename: found.versionFilename || pub.filename });
      if (!found.isCurrent) contentCheck.comparedWithVersion = found.version;
    }
    const contentMatch = contentCheck?.status === 'identical';
    const registeredName = (found.isCurrent ? getFileInfo(pub.docId)?.originalFilename : found.versionFilename) || found.versionFilename || null;
    const renamed = !!req.file && !!registeredName && (authentic || outdated) && !sameFileName(registeredName, req.file.originalname);
    let result = 'tampered';
    if (authentic) result = renamed ? 'renamed' : 'authentic';
    else if (outdated) result = 'outdated';
    else if (contentMatch) result = 'content_match';

    const view = publication.toPublicView(pub);
    const name = view.resolutionNumber ? `Resolution No. ${view.resolutionNumber}` : `"${view.title}"`;
    await publication.logPublicAccess(req, { action: 'verify', docId: pub.docId, result, providedHash });
    await integrity.logVerification({
      docId: pub.docId, filename: pub.filename, action: 'public_verify',
      result: authentic ? (renamed ? 'warning' : 'pass') : (contentMatch || outdated) ? 'warning' : 'fail',
      fileIntact: authentic, reasons: [!authentic && (outdated ? 'outdated_version' : 'copy_differs'), renamed && 'renamed'].filter(Boolean),
      expectedHash, computedHash: providedHash,
      message: `Visitor-supplied copy: ${result}${identification.matchedBy && identification.matchedBy !== 'sha256' ? ` (found by ${identification.matchedBy === 'content' ? `text similarity ${Math.round((identification.similarity || 0) * 100)}%` : 'file name'})` : ''}${ledgerChecked ? '' : ' (ledger unreachable, compared with the published hash)'}`,
      actor: 'public', ip: req.ip,
    });

    let message = `This file differs from the official copy of ${name} registered on the blockchain. It may have been edited after publication.`;
    if (authentic && renamed) message = `The content is identical to the official copy registered on the blockchain, but the file name was changed (official name: ${registeredName}). Please confirm this copy with the issuing office.`;
    else if (authentic) message = 'This file is identical to the official copy registered on the blockchain.';
    else if (outdated) message = `This is a genuine copy of version ${found.version} of ${name}, but it has been replaced: the current official version is version ${found.currentVersion}. Download the current version from this site.`;
    else if (contentMatch) message = `This is not the original file, but its text is identical to the official copy of ${name}. It was likely re-saved or copied into a new document.`;
    else if (identification.matchedBy === 'content') message = `This looks like an ALTERED copy of ${name}: its text is ${Math.round((identification.similarity || 0) * 100)}% similar, but it does not match the official copy registered on the blockchain.`;
    else if (identification.matchedBy === 'filename') message = `This file has the same name as ${name}, but it does not match the official copy registered on the blockchain. It may have been edited.`;

    res.json({
      result,
      message,
      resolution: view,
      providedHash,
      expectedHash: outdated ? found.sha256 : expectedHash,
      currentHash: outdated ? expectedHash : undefined,
      identification: {
        match: identification.match === 'none' ? 'by_id' : identification.match,
        matchedBy: identification.matchedBy || 'id',
        similarity: identification.similarity ?? null,
        version: found.version,
        currentVersion: found.currentVersion,
        isCurrent: found.isCurrent,
        checkedCount: identification.checked,
      },
      contentCheck,
      nameCheck: req.file && registeredName ? { registeredName, providedName: req.file.originalname, renamed } : null,
      ledgerChecked,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Public Verify Error]', err.message);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

module.exports = router;
