'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { getTamperedDocuments, getAllDocuments } = require('../services/blockchainService');

router.get('/tampered', authenticate, async (req, res) => {
  try {
    const tampered = await getTamperedDocuments();
    res.json({ tampered });
  } catch (err) {
    console.error('[Audit Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/', authenticate, async (req, res) => {
  try {
    const documents = await getAllDocuments();
    res.json({ documents });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;