'use strict';

const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const blockchain = require('../services/blockchainService');
const publication = require('../services/publicationService');

// ─── GET /api/publications ───────────────────────────────────────
// Admin: all records | User: records of their own uploads
router.get('/', authenticate, async (req, res) => {
  try {
    const publications = await publication.listForStaff(req.user);
    res.json({ publications });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/publications/access-log ────────────────────────────
// Admin only: who viewed, downloaded or verified public resolutions
router.get('/access-log', authenticate, requireAdmin, async (req, res) => {
  try {
    const logs = await publication.listAccessLog(parseInt(req.query.limit) || 100);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/publications/:id ───────────────────────────────────
// Publish, hide or edit the public details of a document
router.put('/:id', authenticate, async (req, res) => {
  try {
    const ledgerDoc = await blockchain.getDocument(req.params.id);
    if (req.user.role !== 'admin' && ledgerDoc.uploader !== req.user.username) {
      return res.status(403).json({ error: 'Access denied. You can only publish your own documents.' });
    }

    const { isPublic, isConfidential, title, resolutionNumber, resolutionDate, summary } = req.body;
    const saved = await publication.savePublication(
      ledgerDoc,
      { isPublic, isConfidential, title, resolutionNumber, resolutionDate, summary },
      req.user.username,
      { isAdmin: req.user.role === 'admin' }
    );
    res.json({
      message: saved.isPublic ? 'Document is now on the public page.' : 'Document is hidden from the public page.',
      publication: saved,
    });
  } catch (err) {
    console.error('[Publication Error]', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
