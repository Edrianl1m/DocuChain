'use strict';

const fs = require('fs');
const path = require('path');
const { computeHashesFromBuffer, hashBuffer } = require('./hashingService');
const { getUploadDir, listVersionFiles } = require('./storageService');
const { extractText, normalizeText, sameFileName } = require('./contentService');

/**
 * DocuChain — Identify a document from the file alone
 *
 * Verification no longer needs a document ID: the uploaded file is hashed
 * and looked up among every registered document and every version on the
 * ledger.
 *
 *  1. Exact match: the file's SHA-256 equals the hash of a document (current
 *     version) or of one of its older versions in the ledger version history.
 *  2. No exact match: the file was altered, re-saved, or never registered.
 *     To tell which, its text is compared with the text of each registered
 *     file (word 3-gram similarity). The original's text is only used after
 *     its own bytes are confirmed against the ledger hash, so a tampered
 *     server copy can never be used as the reference.
 *  3. Still nothing: a file with the same name as a registered file is
 *     reported as the likely original.
 */

// Similarity (0..1) from which a file is treated as a changed copy of a
// registered document. On the sample BOT resolutions, an edited copy scores
// about 0.93 against its original and at most 0.48 against other resolutions
// (they share the letterhead and the WHEREAS / RESOLVED wording).
const SIMILARITY_THRESHOLD = Number(process.env.VERIFY_SIMILARITY_THRESHOLD) || 0.7;
const TEXT_TYPES = ['.pdf', '.docx', '.txt', '.csv'];

// Word 3-grams of each registered file, keyed by the file's SHA-256.
const shingleCache = new Map();

function shingles(text) {
  const words = normalizeText(text || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const set = new Set();
  if (words.length < 3) { if (words.length) set.add(words.join(' ')); return set; }
  for (let i = 0; i + 2 < words.length; i++) set.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  return set;
}

function dice(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const s of a) if (b.has(s)) shared++;
  return (2 * shared) / (a.size + b.size);
}

/**
 * Every version of a ledger document, joined with its stored file.
 * @returns {Array<{version, sha256, isCurrent, updatedAt, updatedBy, filename, storedPath}>}
 */
function ledgerVersions(doc) {
  const history = Array.isArray(doc.versionHistory) && doc.versionHistory.length
    ? doc.versionHistory
    : [{ version: 1, sha256Hash: doc.hashes?.sha256, updatedAt: doc.registeredAt, updatedBy: doc.uploader }];
  const files = listVersionFiles(doc.docId);
  const current = history.length;
  return history.map(v => {
    const file = files.find(f => f.version === v.version);
    const isCurrent = v.version === current;
    return {
      version: v.version,
      // the current version's hash is the one in `hashes` (same value as the history entry)
      sha256: isCurrent ? (doc.hashes?.sha256 || v.sha256Hash) : v.sha256Hash,
      isCurrent,
      updatedAt: v.updatedAt,
      updatedBy: v.updatedBy,
      filename: file?.originalFilename || (isCurrent ? doc.filename : null),
      storedPath: file ? path.join(getUploadDir(), file.storedFilename) : null,
      storedFilename: file?.storedFilename || null,
    };
  });
}

/** Shingles of a registered file, or null when it can't be trusted or read. */
async function registeredShingles(version) {
  if (!version.sha256 || !version.storedPath) return null;
  if (shingleCache.has(version.sha256)) return shingleCache.get(version.sha256);
  const name = version.filename || version.storedFilename;
  if (!TEXT_TYPES.includes(path.extname(name || '').toLowerCase())) return null;
  if (!fs.existsSync(version.storedPath)) return null;
  const buffer = fs.readFileSync(version.storedPath);
  // Only a stored file that still matches its ledger hash is used as a reference
  if (hashBuffer(buffer, 'sha256') !== version.sha256) return null;
  let set = null;
  try {
    set = shingles(await extractText(buffer, name));
  } catch (err) {
    console.log('[Verify] Could not read text of', name, err.message);
  }
  shingleCache.set(version.sha256, set);
  return set;
}

function describe(doc, version, currentVersion) {
  return {
    docId: doc.docId,
    filename: doc.filename,
    department: doc.department,
    docType: doc.docType,
    uploader: doc.uploader,
    registeredAt: doc.registeredAt,
    version: version.version,
    versionFilename: version.filename,
    versionUpdatedAt: version.updatedAt,
    versionUpdatedBy: version.updatedBy,
    currentVersion,
    isCurrent: version.isCurrent,
    sha256: version.sha256,
    storedFilename: version.storedFilename,
  };
}

/**
 * Find which registered document an uploaded file is.
 * @param {object} p
 * @param {Buffer} [p.buffer]    the uploaded file
 * @param {string} [p.filename]  its original name
 * @param {string} [p.sha256]    only a pasted hash (no file): exact match only
 * @param {Array}  p.documents   ledger records to search (the caller decides
 *                               which ones the user may see, e.g. public only)
 * @returns {Promise<{hashes, match: 'exact'|'similar'|'none', matchedBy?: 'sha256'|'content'|'filename',
 *   similarity?: number, document?: object, alsoMatches?: number, checked: number}>}
 */
async function identify({ buffer, filename, sha256, documents }) {
  const hashes = buffer ? computeHashesFromBuffer(buffer) : { sha256: String(sha256 || '').toLowerCase() };
  const docs = (documents || []).filter(d => d && d.docId);
  const all = docs.map(doc => {
    const versions = ledgerVersions(doc);
    return { doc, versions, current: versions.length };
  });

  // 1. Exact hash match (current version first, then older versions)
  const exact = [];
  for (const { doc, versions, current } of all) {
    for (const v of versions) if (v.sha256 && v.sha256 === hashes.sha256) exact.push({ doc, v, current });
  }
  if (exact.length) {
    exact.sort((a, b) => Number(b.v.isCurrent) - Number(a.v.isCurrent));
    const best = exact[0];
    return {
      hashes, match: 'exact', matchedBy: 'sha256', similarity: 1,
      document: describe(best.doc, best.v, best.current),
      alsoMatches: exact.length - 1,
      checked: docs.length,
    };
  }

  if (!buffer) return { hashes, match: 'none', checked: docs.length };

  // 2. Same text, or text with a few changes
  let best = null;
  const ext = path.extname(filename || '').toLowerCase();
  if (TEXT_TYPES.includes(ext)) {
    let mine = null;
    try { mine = shingles(await extractText(buffer, filename)); } catch { mine = null; }
    if (mine && mine.size) {
      for (const { doc, versions, current } of all) {
        for (const v of versions) {
          const theirs = await registeredShingles(v);
          if (!theirs) continue;
          const score = dice(mine, theirs);
          // ties go to the current version
          if (!best || score > best.score || (score === best.score && v.isCurrent)) best = { doc, v, current, score };
        }
      }
    }
  }
  if (best && best.score >= SIMILARITY_THRESHOLD) {
    return {
      hashes, match: 'similar', matchedBy: 'content', similarity: Math.round(best.score * 1000) / 1000,
      document: describe(best.doc, best.v, best.current),
      checked: docs.length,
    };
  }

  // 3. Same file name as a registered file
  for (const { doc, versions, current } of all) {
    const v = [...versions].reverse().find(x => x.filename && sameFileName(x.filename, filename));
    if (v) {
      return {
        hashes, match: 'similar', matchedBy: 'filename', similarity: best && best.doc.docId === doc.docId ? Math.round(best.score * 1000) / 1000 : null,
        document: describe(doc, v, current),
        checked: docs.length,
      };
    }
  }

  return { hashes, match: 'none', checked: docs.length };
}

module.exports = { identify, ledgerVersions, SIMILARITY_THRESHOLD };
