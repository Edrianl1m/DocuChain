'use strict';

const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/auth');
const blockchain = require('../services/blockchainService');
const DocumentPublication = require('../models/DocumentPublication');
const publication = require('../services/publicationService');
const tor = require('../services/torService');

/**
 * DocuChain — Records Repository
 * Every document filed by year and quarter (e.g. 2026 Q3), with its
 * category (department) and document type, so the Records Office can find a
 * document quickly when the Board or an office requests it.
 *
 * The list of documents and their hashes comes from the ledger; the filing
 * details come from PostgreSQL (document_publications).
 */

function classification(row) {
  if (!row) return 'internal';
  if (row.isConfidential) return 'confidential';
  if (row.isPublic) return 'public';
  return 'internal';
}

function toRecord(doc, row) {
  const date = row?.resolutionDate || doc.registeredAt || row?.createdAt || null;
  const recordYear = row?.recordYear || publication.yearOf(date);
  const recordQuarter = row?.recordQuarter || publication.quarterOf(date);
  return {
    docId: doc.docId,
    filename: doc.filename,
    title: row?.title || null,
    resolutionNumber: row?.resolutionNumber || null,
    resolutionDate: row?.resolutionDate || null,
    department: tor.office(doc.department || row?.department),
    docType: tor.docType(doc.docType || row?.docType),
    uploader: doc.uploader || row?.uploader || null,
    registeredAt: doc.registeredAt || row?.createdAt || null,
    status: doc.status || 'active',
    tampered: !!doc.tampered,
    tamperReasons: doc.tamperReasons || [],
    versions: doc.versionHistory?.length || 1,
    classification: classification(row),
    recordYear,
    recordQuarter,
    // true when no filing was saved yet and it was worked out from the dates
    filingDerived: !(row?.recordYear && row?.recordQuarter),
  };
}

function summarize(records) {
  const years = {};
  for (const r of records) {
    if (!r.recordYear) continue;
    const y = (years[r.recordYear] = years[r.recordYear] || { year: r.recordYear, count: 0, quarters: { 1: 0, 2: 0, 3: 0, 4: 0 } });
    y.count += 1;
    if (r.recordQuarter) y.quarters[r.recordQuarter] += 1;
  }
  return Object.values(years)
    .sort((a, b) => b.year - a.year)
    .map(y => ({ ...y, quarters: [1, 2, 3, 4].map(q => ({ quarter: q, label: publication.quarterLabel(q), count: y.quarters[q] })) }));
}

// ─── GET /api/records ────────────────────────────────────────────
// Admin: every document | Staff: the documents they uploaded
router.get('/', authenticate, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    let documents;
    let ledgerAvailable = true;
    try {
      documents = await blockchain.getAllDocuments();
    } catch (err) {
      // Ledger offline: still show the filing index from the database
      console.log('[Records] Ledger unavailable, listing from the database:', err.message);
      ledgerAvailable = false;
      const rows = await DocumentPublication.findAll();
      documents = rows.map(r => ({ docId: r.docId, filename: r.filename, department: r.department, docType: r.docType, uploader: r.uploader, registeredAt: r.createdAt, status: 'active' }));
    }
    if (!isAdmin) documents = documents.filter(d => d.uploader === req.user.username);

    const rows = await DocumentPublication.findAll({ where: { docId: documents.map(d => d.docId) } });
    const byId = new Map(rows.map(r => [r.docId, r.get({ plain: true })]));
    const records = documents.map(d => toRecord(d, byId.get(d.docId)));

    const count = key => Object.entries(records.reduce((acc, r) => ((acc[r[key]] = (acc[r[key]] || 0) + 1), acc), {}))
      .map(([value, n]) => ({ value, count: n }))
      .sort((a, b) => a.value.localeCompare(b.value));

    res.json({
      records,
      years: summarize(records),
      types: count('docType'),
      departments: count('department'),
      ledgerAvailable,
    });
  } catch (err) {
    console.error('[Records Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/records/:id/filing  { recordYear, recordQuarter } ──
// Re-file a document under another year / quarter. Admin or the uploader.
router.put('/:id/filing', authenticate, async (req, res) => {
  try {
    const ledgerDoc = await blockchain.getDocument(req.params.id);
    if (req.user.role !== 'admin' && ledgerDoc.uploader !== req.user.username) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const { recordYear, recordQuarter } = req.body || {};
    if (!recordYear || !recordQuarter) return res.status(400).json({ error: 'Choose a year and a quarter.' });
    const saved = await publication.savePublication(ledgerDoc, { recordYear, recordQuarter }, req.user.username, { isAdmin: req.user.role === 'admin' });
    res.json({ record: toRecord(ledgerDoc, saved.get({ plain: true })) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
