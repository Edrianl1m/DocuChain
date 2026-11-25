'use strict';

const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const DocumentPublication = require('../models/DocumentPublication');
const PublicAccessLog = require('../models/PublicAccessLog');
const IntegrityLog = require('../models/IntegrityLog');
const { computeMetadataHash } = require('./metadataService');
const blockchain = require('./blockchainService');
const explorer = require('./explorerService');

/**
 * DocuChain — Publication Service
 * Decides what appears on the public resolutions page.
 */

// Only these rows can ever be seen by anonymous visitors
const PUBLIC_WHERE = { isPublic: true, isConfidential: false };

function toBool(value) {
  return value === true || value === 'true' || value === '1' || value === 'on';
}

function emptyToNull(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

/**
 * Find the ledger transaction that registered the current SHA-256 and the
 * block it landed in. Best effort: returns {} when Fabric is unreachable.
 */
async function findLedgerReference(docId, sha256) {
  try {
    const history = await blockchain.getDocumentHistory(docId);
    const entries = (history || [])
      .map(h => {
        let value = {};
        try { value = JSON.parse(h.value); } catch { /* ignore */ }
        return { txId: h.txId, timestamp: h.timestamp, sha256: value.hashes?.sha256 };
      })
      .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    const entry = entries.find(e => e.sha256 === sha256) || entries[0];
    if (!entry) return {};
    const blockNumber = await explorer.getBlockNumberByTxId(entry.txId);
    return { txId: entry.txId, blockNumber };
  } catch (err) {
    console.log('[Publication] Ledger reference lookup failed:', err.message);
    return {};
  }
}

// ─── Records filing (year + quarter) ─────────────────────────────

// Quarters are shown as "Quarter 1" ... "Quarter 4" (no month ranges)
const QUARTER_NAMES = { 1: 'Quarter 1', 2: 'Quarter 2', 3: 'Quarter 3', 4: 'Quarter 4' };

/** Calendar quarter (1-4) of a date; null when the date is missing or invalid. */
function quarterOf(value) {
  if (!value) return null;
  const s = String(value);
  const month = /^\d{4}-\d{2}/.test(s) ? Number(s.slice(5, 7)) : (new Date(value).getMonth() + 1);
  return month >= 1 && month <= 12 ? Math.ceil(month / 3) : null;
}

function yearOf(value) {
  if (!value) return null;
  const s = String(value);
  const year = /^\d{4}/.test(s) ? Number(s.slice(0, 4)) : new Date(value).getFullYear();
  return Number.isFinite(year) ? year : null;
}

function parseYear(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    const err = new Error('Filing year must be a 4-digit year.');
    err.status = 400;
    throw err;
  }
  return year;
}

function parseQuarter(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const q = Number(String(value).replace(/^q/i, ''));
  if (![1, 2, 3, 4].includes(q)) {
    const err = new Error('Quarter must be Q1, Q2, Q3 or Q4.');
    err.status = 400;
    throw err;
  }
  return q;
}

/**
 * Year and quarter a document is filed under: what staff chose, otherwise
 * the quarter of the resolution / document date, otherwise of the upload.
 */
function resolveFiling(fields, existing, resolutionDate, fallbackDate) {
  const chosenYear = fields.recordYear !== undefined ? parseYear(fields.recordYear) : (existing?.recordYear ?? null);
  const chosenQuarter = fields.recordQuarter !== undefined ? parseQuarter(fields.recordQuarter) : (existing?.recordQuarter ?? null);
  const base = resolutionDate || fallbackDate || new Date();
  return {
    recordYear: chosenYear ?? yearOf(base),
    recordQuarter: chosenQuarter ?? quarterOf(base),
  };
}

function quarterLabel(q) {
  return q ? QUARTER_NAMES[q] : '';
}

/**
 * Build the publication row for a ledger document without saving it.
 * Used by savePublication, and by the upload route to hash the metadata
 * before the document is registered on the ledger.
 */
function buildRecord(ledgerDoc, fields, username, existing = null) {
  const pick = (key, fallback) => (fields[key] !== undefined ? fields[key] : fallback);

  const isConfidential = toBool(pick('isConfidential', existing?.isConfidential || false));
  const isPublic = toBool(pick('isPublic', existing?.isPublic || false));
  if (isPublic && isConfidential) {
    const err = new Error('Confidential documents cannot be published on the public page.');
    err.status = 400;
    throw err;
  }
  if (isPublic && ledgerDoc.status && ledgerDoc.status !== 'active') {
    const err = new Error('Deactivated documents cannot be published.');
    err.status = 400;
    throw err;
  }

  const sha256 = ledgerDoc.hashes?.sha256 || existing?.sha256 || null;
  const record = {
    docId: ledgerDoc.docId,
    title: emptyToNull(pick('title', existing?.title)),
    resolutionNumber: emptyToNull(pick('resolutionNumber', existing?.resolutionNumber)),
    resolutionDate: emptyToNull(pick('resolutionDate', existing?.resolutionDate)),
    summary: emptyToNull(pick('summary', existing?.summary)),
    isPublic,
    isConfidential,
    filename: ledgerDoc.filename,
    sha256,
    department: ledgerDoc.department,
    docType: ledgerDoc.docType,
    uploader: ledgerDoc.uploader,
  };
  Object.assign(record, resolveFiling(fields, existing, record.resolutionDate, existing?.createdAt || ledgerDoc.registeredAt));

  if (isPublic && !existing?.isPublic) {
    record.publishedBy = username;
    record.publishedAt = new Date();
  }
  return record;
}

/**
 * Create or update the publication record of a ledger document.
 * When the protected metadata (title, classification, owner...) changes, the
 * new metadata hash is written to the ledger in the same step, so only edits
 * made outside the app show up as tampering.
 * @param {object} ledgerDoc - record from the smart contract
 * @param {object} fields - { isPublic, isConfidential, title, resolutionNumber, resolutionDate, summary }
 * @param {string} username - staff member making the change
 */
async function savePublication(ledgerDoc, fields, username, { isAdmin = false } = {}) {
  const existing = await DocumentPublication.findByPk(ledgerDoc.docId);
  // If the row was already changed outside the app, saving would anchor those
  // changes as legitimate. Only an admin (who sees the current values) may do that.
  if (existing && ledgerDoc.metadataHash && computeMetadataHash(existing) !== ledgerDoc.metadataHash && !isAdmin) {
    const err = new Error('This document\'s details were changed outside DocuChain (they no longer match the blockchain). An admin must review and save them first.');
    err.status = 409;
    throw err;
  }
  const record = buildRecord(ledgerDoc, fields, username, existing);
  const sha256 = record.sha256;

  // Look up block/tx once (or again if the hash changed)
  const hasRef = existing?.blockNumber !== null && existing?.blockNumber !== undefined;
  const needsRef = record.isPublic && (!hasRef || existing.sha256 !== sha256);
  if (needsRef) Object.assign(record, await findLedgerReference(ledgerDoc.docId, sha256));

  const metadataHash = computeMetadataHash(record);
  if (ledgerDoc.metadataHash === metadataHash) {
    await DocumentPublication.upsert(record);
  } else {
    // Save and anchor together: if the ledger write fails, the database change is rolled back
    await sequelize.transaction(async (transaction) => {
      await DocumentPublication.upsert(record, { transaction });
      await blockchain.updateMetadataHash(ledgerDoc.docId, metadataHash, username);
    });
    try {
      await IntegrityLog.create({
        docId: ledgerDoc.docId,
        filename: ledgerDoc.filename,
        action: 'metadata_update',
        result: 'pass',
        metadataIntact: true,
        expectedMetadataHash: ledgerDoc.metadataHash || null,
        computedMetadataHash: metadataHash,
        ledgerRecorded: true,
        message: ledgerDoc.metadataHash ? 'Metadata changed in the app; new hash written to the ledger.' : 'Metadata hash anchored on the ledger.',
        actor: username,
      });
    } catch (err) {
      console.error('[Integrity Log] Failed to log metadata update:', err.message);
    }
  }
  return DocumentPublication.findByPk(ledgerDoc.docId);
}

async function hideDocument(docId) {
  await DocumentPublication.update({ isPublic: false }, { where: { docId } });
}

async function listForStaff(user) {
  const where = user.role === 'admin' ? {} : { uploader: user.username };
  return DocumentPublication.findAll({ where, order: [['updatedAt', 'DESC']] });
}

// ─── Public side ─────────────────────────────────────────────────

/**
 * Hide published rows whose document is no longer active on the ledger
 * (deactivated, or lost when the Fabric network was recreated). The staff
 * pages list documents from the ledger, so such rows would otherwise stay
 * on the public page with no way to manage them. Runs at most every 30s and
 * is skipped while Fabric is unreachable.
 */
const LEDGER_SYNC_MS = 30000;
let lastLedgerSync = 0;

async function hideDocumentsMissingFromLedger() {
  if (Date.now() - lastLedgerSync < LEDGER_SYNC_MS) return;
  try {
    const documents = await Promise.race([
      blockchain.getAllDocuments(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Ledger request timed out.')), 5000)),
    ]);
    lastLedgerSync = Date.now();
    const active = new Set((documents || []).map(d => d.docId));
    const published = await DocumentPublication.findAll({ where: PUBLIC_WHERE, attributes: ['docId'] });
    const missing = published.map(p => p.docId).filter(id => !active.has(id));
    if (missing.length) {
      await DocumentPublication.update({ isPublic: false }, { where: { docId: missing } });
      console.log(`[Publication] Hid ${missing.length} public document(s) not active on the ledger:`, missing.join(', '));
    }
  } catch (err) {
    console.log('[Publication] Ledger check skipped:', err.message);
  }
}

function toPublicView(pub) {
  return {
    docId: pub.docId,
    title: pub.title || pub.filename,
    resolutionNumber: pub.resolutionNumber,
    resolutionDate: pub.resolutionDate,
    summary: pub.summary,
    filename: pub.filename,
    fileType: (pub.filename || '').split('.').pop().toLowerCase(),
    category: pub.department || null,
    docType: pub.docType || null,
    recordYear: pub.recordYear || null,
    recordQuarter: pub.recordQuarter || null,
    sha256: pub.sha256,
    txId: pub.txId,
    blockNumber: pub.blockNumber,
    publishedAt: pub.publishedAt,
  };
}

const effectiveDate = sequelize.fn('COALESCE', sequelize.col('resolutionDate'), sequelize.col('publishedAt'), sequelize.col('createdAt'));
// Filing year / quarter, falling back to the date for rows filed before these columns existed
const filingYear = sequelize.fn('COALESCE', sequelize.col('recordYear'), sequelize.fn('date_part', 'year', effectiveDate));
const filingQuarter = sequelize.fn('COALESCE', sequelize.col('recordQuarter'), sequelize.fn('date_part', 'quarter', effectiveDate));

const SORTS = {
  newest: [[effectiveDate, 'DESC'], ['createdAt', 'DESC']],
  oldest: [[effectiveDate, 'ASC'], ['createdAt', 'ASC']],
  number: [['resolutionNumber', 'ASC NULLS LAST'], ['createdAt', 'DESC']],
  title: [['title', 'ASC NULLS LAST'], ['createdAt', 'DESC']],
};

// Distinct values of a column among public rows, with how many use each
async function countBy(column) {
  const rows = await DocumentPublication.findAll({
    where: { ...PUBLIC_WHERE, [column]: { [Op.ne]: null } },
    attributes: [[sequelize.col(column), 'value'], [sequelize.fn('COUNT', sequelize.col('docId')), 'count']],
    group: [column],
    raw: true,
  });
  return rows
    .map(r => ({ value: r.value, count: Number(r.count) }))
    .filter(r => r.value)
    .sort((a, b) => a.value.localeCompare(b.value));
}

// ─── Search inside the files (public site) ──────────────────────
// The text of each public file is read once and kept in memory (keyed by its
// SHA-256, so a new version is read again). Used for the "found in the text"
// excerpt and as a fallback when MeiliSearch is not reachable.
const textCache = new Map();

async function publicText(pub) {
  const cached = textCache.get(pub.docId);
  if (cached && cached.sha256 === pub.sha256) return cached.text;
  let text = '';
  try {
    const { extractText } = require('./contentService');
    const { getFileInfo, getUploadDir } = require('./storageService');
    const info = getFileInfo(pub.docId);
    const filePath = info && path.join(getUploadDir(), info.storedFilename);
    if (filePath && fs.existsSync(filePath)) {
      text = (await extractText(fs.readFileSync(filePath), info.originalFilename || pub.filename)) || '';
    }
  } catch (err) {
    console.log('[Public Search] Could not read text of', pub.docId, err.message);
  }
  text = text.replace(/\s+/g, ' ').trim();
  textCache.set(pub.docId, { sha256: pub.sha256, text });
  return text;
}

function searchWords(q) {
  return q.toLowerCase().split(/\s+/).map(w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(w => w.length > 1);
}

// Public docIds whose file text contains the query: MeiliSearch first,
// otherwise a plain scan of the (small) set of public files
async function publicIdsMatchingText(q) {
  try {
    const search = require('./searchService');
    return await search.searchTextIds(q);
  } catch (err) {
    console.log('[Public Search] MeiliSearch unavailable, scanning file text instead:', err.message);
  }
  const words = searchWords(q);
  if (!words.length) return [];
  const rows = await DocumentPublication.findAll({ where: PUBLIC_WHERE });
  const ids = [];
  for (const pub of rows) {
    const text = (await publicText(pub)).toLowerCase();
    if (words.every(w => text.includes(w))) ids.push(pub.docId);
  }
  return ids;
}

// A short piece of the file text around the first match, split so the page
// can highlight the matched words without inserting HTML
async function textExcerpt(pub, q, radius = 90) {
  const text = await publicText(pub);
  if (!text) return null;
  const lower = text.toLowerCase();
  const phrase = q.trim().toLowerCase();
  let at = lower.indexOf(phrase);
  let len = phrase.length;
  if (at < 0) {
    for (const w of searchWords(q).sort((a, b) => b.length - a.length)) {
      at = lower.indexOf(w);
      if (at >= 0) { len = w.length; break; }
    }
  }
  if (at < 0) return null;
  let start = Math.max(0, at - radius);
  let end = Math.min(text.length, at + len + radius);
  if (start > 0) { const sp = text.indexOf(' ', start); if (sp > 0 && sp < at) start = sp + 1; }
  if (end < text.length) { const sp = text.lastIndexOf(' ', end); if (sp > at + len) end = sp; }
  return {
    before: (start > 0 ? '…' : '') + text.slice(start, at),
    match: text.slice(at, at + len),
    after: text.slice(at + len, end) + (end < text.length ? '…' : ''),
  };
}

async function listPublic({ q, year, quarter, category, type, sort, page = 1, limit = 10 }) {
  await hideDocumentsMissingFromLedger();
  const where = { ...PUBLIC_WHERE };
  const and = [];
  const text = q && q.trim() ? q.trim().slice(0, 200) : '';
  let textIds = [];
  if (text) {
    const like = `%${text}%`;
    // Words inside the file count too, not only the title and details
    textIds = await publicIdsMatchingText(text);
    and.push({
      [Op.or]: [
        { title: { [Op.iLike]: like } },
        { resolutionNumber: { [Op.iLike]: like } },
        { summary: { [Op.iLike]: like } },
        { filename: { [Op.iLike]: like } },
        { department: { [Op.iLike]: like } },
        ...(textIds.length ? [{ docId: { [Op.in]: textIds } }] : []),
      ],
    });
  }
  if (year && /^\d{4}$/.test(String(year))) {
    and.push(sequelize.where(filingYear, Number(year)));
  }
  if (quarter && /^[1-4]$/.test(String(quarter).replace(/^q/i, ''))) {
    and.push(sequelize.where(filingQuarter, Number(String(quarter).replace(/^q/i, ''))));
  }
  if (category && String(category).trim()) where.department = String(category).trim();
  if (type && String(type).trim()) where.docType = String(type).trim();
  if (and.length) where[Op.and] = and;

  const { rows, count } = await DocumentPublication.findAndCountAll({
    where,
    order: SORTS[sort] || SORTS.newest,
    limit,
    offset: (page - 1) * limit,
  });

  const yearRows = await DocumentPublication.findAll({
    where: PUBLIC_WHERE,
    attributes: [[sequelize.fn('DISTINCT', filingYear), 'year']],
    raw: true,
  });
  const years = yearRows.map(r => Number(r.year)).filter(Boolean).sort((a, b) => b - a);
  // Quarters that have public documents (within the chosen year, if any)
  const quarterWhere = { ...PUBLIC_WHERE };
  if (year && /^\d{4}$/.test(String(year))) quarterWhere[Op.and] = [sequelize.where(filingYear, Number(year))];
  const quarterRows = await DocumentPublication.findAll({
    where: quarterWhere,
    attributes: [[filingQuarter, 'quarter'], [sequelize.fn('COUNT', sequelize.col('docId')), 'count']],
    group: [filingQuarter],
    raw: true,
  });
  const quarters = quarterRows.map(r => ({ value: Number(r.quarter), count: Number(r.count) })).filter(r => r.value).sort((a, b) => a.value - b.value);
  const [categories, types, overall] = await Promise.all([
    countBy('department'),
    countBy('docType'),
    DocumentPublication.count({ where: PUBLIC_WHERE }),
  ]);

  let resolutions = rows.map(toPublicView);
  if (text) {
    // Show where the words were found inside the file
    const inText = new Set(textIds);
    resolutions = await Promise.all(rows.map(async (pub, i) => {
      const excerpt = await textExcerpt(pub, text);
      return { ...resolutions[i], matchedInText: inText.has(pub.docId) || !!excerpt, excerpt };
    }));
  }

  return { resolutions, total: count, overall, page, limit, years, quarters, categories, types };
}

async function getPublic(docId) {
  await hideDocumentsMissingFromLedger();
  return DocumentPublication.findOne({ where: { ...PUBLIC_WHERE, docId } });
}

/** Every row a visitor may see (public and never confidential). */
async function listAllPublic() {
  await hideDocumentsMissingFromLedger();
  return DocumentPublication.findAll({ where: PUBLIC_WHERE });
}

async function findPublicByHash(sha256) {
  await hideDocumentsMissingFromLedger();
  return DocumentPublication.findOne({ where: { ...PUBLIC_WHERE, sha256 } });
}

async function logPublicAccess(req, { action, docId = null, result = null, providedHash = null }) {
  try {
    await PublicAccessLog.create({
      action,
      docId,
      result,
      providedHash,
      ip: req.ip,
      userAgent: (req.get('user-agent') || '').slice(0, 255),
    });
  } catch (err) {
    console.error('[Public Audit] Failed to log access:', err.message);
  }
}

async function listAccessLog(limit = 100) {
  return PublicAccessLog.findAll({ order: [['createdAt', 'DESC']], limit });
}

async function getRecord(docId) {
  return DocumentPublication.findByPk(docId);
}

/**
 * Add the filing columns to an existing database (production does not run
 * sequelize.sync with alter) and file every document that has none yet under
 * the quarter of its resolution / document date, or of its upload date.
 */
async function ensureFilingColumns() {
  const qi = sequelize.getQueryInterface();
  const table = await qi.describeTable('document_publications').catch(() => null);
  if (!table) return;
  if (!table.recordYear) await qi.addColumn('document_publications', 'recordYear', { type: sequelize.Sequelize.INTEGER, allowNull: true });
  if (!table.recordQuarter) await qi.addColumn('document_publications', 'recordQuarter', { type: sequelize.Sequelize.INTEGER, allowNull: true });
  const [, meta] = await sequelize.query(`
    UPDATE document_publications SET
      "recordYear" = COALESCE("recordYear", date_part('year', COALESCE("resolutionDate"::timestamptz, "createdAt"))::int),
      "recordQuarter" = COALESCE("recordQuarter", date_part('quarter', COALESCE("resolutionDate"::timestamptz, "createdAt"))::int)
    WHERE "recordYear" IS NULL OR "recordQuarter" IS NULL`);
  const filed = meta?.rowCount || 0;
  if (filed) console.log(`[Records] Filed ${filed} existing document(s) by year and quarter.`);

  // Old document type / office labels -> ToR names (public filters read these columns)
  const tor = require('./torService');
  let relabelled = 0;
  for (const [column, map] of [['docType', tor.LEGACY_DOC_TYPES], ['department', tor.LEGACY_OFFICES]]) {
    for (const [from, to] of Object.entries(map)) {
      const [, m] = await sequelize.query(`UPDATE document_publications SET "${column}" = :to WHERE "${column}" = :from`, { replacements: { from, to } });
      relabelled += m?.rowCount || 0;
    }
  }
  if (relabelled) console.log(`[Records] Renamed ${relabelled} document type / office label(s) to the ToR names.`);
  syncSearchLabels();
}

// Search index: give documents registered with old labels the ToR names (best effort)
async function syncSearchLabels() {
  try {
    const tor = require('./torService');
    const { updateIndex } = require('./searchService');
    const raw = await require('../config/fabric').evaluateTransaction('GetAllDocuments');
    const old = (raw || []).filter(d => tor.LEGACY_DOC_TYPES[d.docType] || tor.LEGACY_OFFICES[d.department]);
    for (const d of old) await updateIndex(d.docId, { docType: tor.docType(d.docType), department: tor.office(d.department) });
    if (old.length) console.log(`[Search] Updated ${old.length} document(s) to the ToR labels.`);
  } catch (err) {
    console.log('[Search] ToR label update skipped:', err.message);
  }
}

module.exports = {
  quarterOf,
  yearOf,
  quarterLabel,
  QUARTER_NAMES,
  ensureFilingColumns,
  buildRecord,
  getRecord,
  savePublication,
  hideDocument,
  listForStaff,
  listPublic,
  getPublic,
  listAllPublic,
  findPublicByHash,
  toPublicView,
  logPublicAccess,
  listAccessLog,
  findLedgerReference,
};
