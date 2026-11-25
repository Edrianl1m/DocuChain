'use strict';

const fs = require('fs');
const path = require('path');
const { QueryTypes } = require('sequelize');

const { sequelize } = require('../config/database');
const IntegrityLog = require('../models/IntegrityLog');
const IntegrityScan = require('../models/IntegrityScan');
const blockchain = require('./blockchainService');
const { hashBuffer } = require('./hashingService');
const { computeMetadataHash } = require('./metadataService');
const { getFileInfo, getUploadDir } = require('./storageService');
const publication = require('./publicationService');

/**
 * DocuChain — Integrity Service
 *
 * Every time a stored file is downloaded or viewed, and on a schedule for all
 * documents, the server:
 *   1. re-hashes the stored file (SHA-256),
 *   2. hashes the document's key PostgreSQL fields (title, classification, owner),
 *   3. asks the chaincode VerifyDocument() to compare both with the ledger,
 *   4. writes the result to the integrity audit log,
 *   5. on a new failure, the chaincode records the tamper flag on the ledger
 *      and an admin is notified (optional webhook).
 */

const REASON_TEXT = {
  file: 'The stored file does not match the SHA-256 hash on the blockchain.',
  file_missing: 'The stored file is missing from the server.',
  metadata: 'The document details in the database (title, classification or owner) were changed outside DocuChain.',
  metadata_missing: 'The document details row was deleted from the database.',
};

function describeReasons(reasons = []) {
  return reasons.map(r => REASON_TEXT[r] || r).join(' ');
}

function withTimeout(promise, ms, label = 'Ledger request') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out.`)), ms)),
  ]);
}

// ─── Audit log ───────────────────────────────────────────────────
async function logVerification(entry) {
  try {
    return await IntegrityLog.create({
      ...entry,
      reasons: Array.isArray(entry.reasons) ? entry.reasons.join(',') : entry.reasons || null,
      message: entry.message ? String(entry.message).slice(0, 500) : null,
    });
  } catch (err) {
    console.error('[Integrity Log] Failed to write log:', err.message);
    return null;
  }
}

// ─── Admin notification ──────────────────────────────────────────
// Optional: set ADMIN_ALERT_WEBHOOK_URL (Discord, Slack, Teams, or any URL that
// accepts a JSON POST). The same alert is not sent twice within an hour.
const recentAlerts = new Map();
const ALERT_REPEAT_MS = 60 * 60 * 1000;

async function notifyAdmins(check) {
  const key = `${check.docId}:${(check.reasons || []).join(',')}`;
  const last = recentAlerts.get(key);
  if (last && Date.now() - last < ALERT_REPEAT_MS) return;
  recentAlerts.set(key, Date.now());

  const text = `⚠ DocuChain integrity alert: "${check.filename || check.docId}" failed verification during ${check.action}. ${describeReasons(check.reasons)} (document ID ${check.docId})`;
  console.warn('[Integrity Alert]', text);

  const url = process.env.ADMIN_ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    await withTimeout(fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `content` is read by Discord, `text` by Slack/Teams; the rest is for custom receivers
      body: JSON.stringify({
        content: text,
        text,
        event: 'document_tampered',
        docId: check.docId,
        filename: check.filename,
        action: check.action,
        reasons: check.reasons,
        at: new Date().toISOString(),
      }),
    }), 5000, 'Admin webhook');
  } catch (err) {
    console.error('[Integrity Alert] Webhook failed:', err.message);
  }
}

// ─── Core check ──────────────────────────────────────────────────
/**
 * Verify the server's stored copy of a document and its database metadata.
 *
 * @param {string} docId
 * @param {object} opts
 * @param {string} opts.action      download | view | verify | scan | public_view | public_download | public_preview
 * @param {string} [opts.actor]     username, 'public' or 'system'
 * @param {object} [opts.req]       express request (for the IP)
 * @param {object} [opts.ledgerDoc] ledger record if already loaded
 * @param {boolean} [opts.record=true]  allow the chaincode to write the tamper flag
 * @param {boolean} [opts.log=true]     write the result to the audit log
 * @param {string} [opts.scanId]
 * @returns {Promise<object>} { status: 'pass'|'fail'|'unverified'|'error', filePath, fileInfo, ... }
 */
async function checkStoredDocument(docId, opts = {}) {
  const { action, actor = 'system', req = null, record = true, log = true, scanId = null } = opts;
  let ledgerDoc = opts.ledgerDoc || null;

  const result = {
    docId,
    action,
    status: 'error',
    fileIntact: null,
    metadataIntact: null,
    reasons: [],
    filePath: null,
    fileInfo: null,
    ledgerRecorded: false,
    newlyTampered: false,
    message: '',
  };

  try {
    // 1. Stored file → SHA-256
    const fileInfo = getFileInfo(docId);
    const filePath = fileInfo && path.join(getUploadDir(), fileInfo.storedFilename);
    result.fileInfo = fileInfo;
    let computedHash = '';
    if (fileInfo) {
      if (fs.existsSync(filePath)) {
        computedHash = hashBuffer(fs.readFileSync(filePath), 'sha256');
        result.filePath = filePath;
      } else {
        computedHash = 'missing';
      }
    }
    result.computedHash = computedHash || null;

    // 2. Database metadata → SHA-256
    if (!ledgerDoc) ledgerDoc = await withTimeout(blockchain.getDocument(docId), 8000);
    result.filename = ledgerDoc.filename;
    result.ledgerDoc = ledgerDoc;
    let computedMetadataHash = '';
    // Deactivated documents are hidden by the app itself, so their metadata isn't checked
    if (ledgerDoc.metadataHash && ledgerDoc.status === 'active') {
      const row = await publication.getRecord(docId);
      computedMetadataHash = row ? computeMetadataHash(row) : 'missing';
    }
    result.computedMetadataHash = computedMetadataHash || null;

    // 3. Chaincode comparison (written to the ledger only if the status changed)
    const verdict = await withTimeout(blockchain.verifyDocument(docId, {
      sha256: computedHash,
      metadataHash: computedMetadataHash,
      source: 'stored',
      checkedBy: actor,
      context: action,
      record,
    }), 15000);

    result.ledger = verdict;
    result.fileIntact = verdict.fileIntact;
    result.metadataIntact = verdict.metadataIntact;
    result.metadataAnchored = verdict.metadataAnchored;
    result.expectedHash = verdict.storedHash;
    result.expectedMetadataHash = verdict.storedMetadataHash;
    result.ledgerRecorded = !!verdict.recorded;
    result.newlyTampered = verdict.tampered && (!verdict.wasTampered || verdict.needsRecord);

    // Reasons found by this check (the ledger may also remember older ones)
    const reasons = [];
    if (verdict.fileIntact === false) reasons.push(computedHash === 'missing' ? 'file_missing' : 'file');
    if (verdict.metadataIntact === false) reasons.push(computedMetadataHash === 'missing' ? 'metadata_missing' : 'metadata');
    result.reasons = reasons;

    if (reasons.length) {
      result.status = 'fail';
      result.message = describeReasons(reasons);
    } else if (!fileInfo) {
      result.status = 'unverified';
      result.message = 'No stored copy is tracked for this document (uploaded before file tracking), so only the ledger record exists.';
    } else {
      result.status = 'pass';
      result.message = verdict.metadataAnchored
        ? 'File and metadata match the blockchain.'
        : 'File matches the blockchain. Metadata is not anchored on the ledger yet.';
      if (verdict.wasTampered && !verdict.tampered) result.message += ' The earlier tamper flag was cleared.';
    }
  } catch (err) {
    result.status = 'error';
    result.message = `Integrity check could not run: ${err.message}`;
    result.errorMessage = err.message;
  }

  if (log) {
    await logVerification({
      docId,
      filename: result.filename || result.fileInfo?.originalFilename || null,
      action,
      result: result.status,
      fileIntact: result.fileIntact,
      metadataIntact: result.metadataIntact,
      reasons: result.reasons,
      expectedHash: result.expectedHash || null,
      computedHash: result.computedHash && result.computedHash.length === 64 ? result.computedHash : null,
      expectedMetadataHash: result.expectedMetadataHash || null,
      computedMetadataHash: result.computedMetadataHash && result.computedMetadataHash.length === 64 ? result.computedMetadataHash : null,
      ledgerRecorded: result.ledgerRecorded,
      blocked: !!opts.blockOnFail && result.status === 'fail',
      message: result.message,
      actor,
      ip: req?.ip || null,
      scanId,
    });
  }

  if (result.status === 'fail' && result.ledgerRecorded) {
    notifyAdmins({ docId, filename: result.filename, action, reasons: result.reasons }).catch(() => {});
  }
  return result;
}

// ─── Scheduled integrity scan ────────────────────────────────────
let currentScan = null;

async function runScan({ trigger = 'scheduled', startedBy = 'system' } = {}) {
  if (currentScan) return { alreadyRunning: true, scan: currentScan };

  const scan = await IntegrityScan.create({ trigger, startedBy, status: 'running' });
  currentScan = scan;
  const counts = { total: 0, passed: 0, failed: 0, unverified: 0, errors: 0 };
  const failures = [];
  try {
    const documents = await withTimeout(blockchain.getAllDocuments(), 15000);
    counts.total = documents.length;
    for (const doc of documents) {
      const r = await checkStoredDocument(doc.docId, { action: 'scan', actor: 'system', ledgerDoc: doc, scanId: scan.id });
      if (r.status === 'pass') counts.passed++;
      else if (r.status === 'fail') { counts.failed++; failures.push({ docId: doc.docId, filename: doc.filename, reasons: r.reasons }); }
      else if (r.status === 'unverified') counts.unverified++;
      else counts.errors++;
    }
    await scan.update({ ...counts, status: 'done', finishedAt: new Date() });
    console.log(`[Integrity Scan] ${trigger}: ${counts.total} checked, ${counts.passed} passed, ${counts.failed} failed, ${counts.unverified} unverified, ${counts.errors} errors`);
  } catch (err) {
    console.error('[Integrity Scan] Failed:', err.message);
    await scan.update({ ...counts, status: 'failed', error: err.message.slice(0, 500), finishedAt: new Date() });
  } finally {
    currentScan = null;
  }
  const saved = scan.get({ plain: true });
  return { scan: saved, failures };
}

let timer = null;
function startScheduler() {
  const minutes = parseFloat(process.env.INTEGRITY_SCAN_INTERVAL_MINUTES ?? '60');
  if (!(minutes > 0)) {
    console.log('[Integrity Scan] Scheduler disabled (INTEGRITY_SCAN_INTERVAL_MINUTES=0)');
    return;
  }
  const intervalMs = Math.max(1, minutes) * 60 * 1000;
  // First scan shortly after startup, then every interval
  setTimeout(() => runScan({ trigger: 'startup' }).catch(() => {}), 60 * 1000).unref();
  timer = setInterval(() => runScan({ trigger: 'scheduled' }).catch(() => {}), intervalMs);
  timer.unref();
  console.log(`[Integrity Scan] Scheduled every ${Math.max(1, minutes)} minute(s)`);
}

function isScanRunning() {
  return !!currentScan;
}

// ─── Queries for the audit trail ─────────────────────────────────
async function listLogs({ limit = 200, docId, result, action } = {}) {
  const where = {};
  if (docId) where.docId = docId;
  if (result) where.result = result;
  if (action) where.action = action;
  return IntegrityLog.findAll({ where, order: [['createdAt', 'DESC']], limit: Math.min(1000, limit) });
}

async function latestChecks() {
  const rows = await sequelize.query(
    `SELECT DISTINCT ON ("docId") "docId", "action", "result", "reasons", "createdAt"
       FROM integrity_logs
      WHERE "docId" IS NOT NULL AND "action" <> 'metadata_update'
      ORDER BY "docId", "createdAt" DESC`,
    { type: QueryTypes.SELECT }
  );
  const map = {};
  for (const r of rows) map[r.docId] = r;
  return map;
}

async function listScans(limit = 10) {
  return IntegrityScan.findAll({ order: [['createdAt', 'DESC']], limit });
}

/**
 * Anchor the metadata hash of documents registered before metadata hashing
 * existed. Only documents whose ledger record has no metadata hash are touched.
 */
async function anchorMissingMetadata(username) {
  const documents = await blockchain.getAllDocuments();
  const anchored = [];
  const skipped = [];
  for (const doc of documents) {
    if (doc.metadataHash) continue;
    try {
      // Saving with no field changes builds the row (or keeps it) and writes its hash on-chain
      await publication.savePublication(doc, {}, username, { isAdmin: true });
      anchored.push(doc.docId);
    } catch (err) {
      skipped.push({ docId: doc.docId, error: err.message });
    }
  }
  return { anchored: anchored.length, skipped };
}

module.exports = {
  checkStoredDocument,
  logVerification,
  notifyAdmins,
  runScan,
  startScheduler,
  isScanRunning,
  listLogs,
  latestChecks,
  listScans,
  anchorMissingMetadata,
  describeReasons,
};
