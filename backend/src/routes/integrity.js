'use strict';

const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const integrity = require('../services/integrityService');

// ─── GET /api/integrity/summary ──────────────────────────────────
// Latest check per document and the last scan (for the audit trail / dashboard)
router.get('/summary', authenticate, async (req, res) => {
  try {
    const [latest, scans] = await Promise.all([integrity.latestChecks(), integrity.listScans(1)]);
    res.json({
      latest,
      lastScan: scans[0] || null,
      scanRunning: integrity.isScanRunning(),
      scanIntervalMinutes: parseFloat(process.env.INTEGRITY_SCAN_INTERVAL_MINUTES ?? '60'),
    });
  } catch (err) {
    console.error('[Integrity Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/integrity/logs?docId=&result=&action=&limit= ───────
// Admin: every verification (pass or fail)
router.get('/logs', authenticate, requireAdmin, async (req, res) => {
  try {
    const logs = await integrity.listLogs({
      limit: parseInt(req.query.limit) || 200,
      docId: req.query.docId || undefined,
      result: req.query.result || undefined,
      action: req.query.action || undefined,
    });
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/integrity/scans ────────────────────────────────────
router.get('/scans', authenticate, requireAdmin, async (req, res) => {
  try {
    res.json({ scans: await integrity.listScans(parseInt(req.query.limit) || 10) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/integrity/scan ────────────────────────────────────
// Admin: run the integrity scan now (it also runs on a schedule)
router.post('/scan', authenticate, requireAdmin, async (req, res) => {
  try {
    const run = integrity.runScan({ trigger: 'manual', startedBy: req.user.username });
    const outcome = await Promise.race([run, new Promise(resolve => setTimeout(() => resolve(null), 60000))]);
    if (!outcome) return res.status(202).json({ message: 'The scan is still running. Refresh the audit trail in a minute.' });
    if (outcome.alreadyRunning) return res.status(409).json({ error: 'A scan is already running.' });
    res.json(outcome);
  } catch (err) {
    console.error('[Integrity Scan Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/integrity/anchor-metadata ─────────────────────────
// Admin: write the metadata hash for documents uploaded before metadata
// hashing existed (documents that already have one are not changed)
router.post('/anchor-metadata', authenticate, requireAdmin, async (req, res) => {
  try {
    res.json(await integrity.anchorMissingMetadata(req.user.username));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
