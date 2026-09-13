'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const blockchain = require('../services/blockchainService');

let searchService;
setTimeout(() => { searchService = require('../services/searchService'); }, 0);

router.get('/', authenticate, async (req, res) => {
  try {
    const { q, department, docType, tag, limit, offset } = req.query;
    const query = (!q || q.trim() === '' || q === '*') ? '' : q.trim();

    const results = await searchService.searchDocuments(query, {
      department,
      docType,
      tag,
      limit: parseInt(limit) || 20,
      offset: parseInt(offset) || 0,
    });
    res.json({
      query: q,
      totalHits: results.estimatedTotalHits,
      hits: results.hits,
    });
  } catch (err) {
    console.error('[Search Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/reindex', authenticate, async (req, res) => {
  try {
    const documents = await blockchain.getAllDocuments();
    let count = 0;
    for (const doc of documents) {
      await searchService.indexDocument({
        docId: doc.docId,
        filename: doc.filename,
        content: doc.filename,
        department: doc.department,
        docType: doc.docType,
        uploader: doc.uploader,
        registeredAt: doc.registeredAt,
        tags: [],
        status: doc.status,
      });
      count++;
    }
    res.json({ message: `Reindexed ${count} documents.` });
  } catch (err) {
    console.error('[Reindex Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;