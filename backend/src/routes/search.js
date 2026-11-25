'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');
const blockchain = require('../services/blockchainService');
const { getFileInfo, getUploadDir } = require('../services/storageService');
const { extractText } = require('../services/contentService');

// Text of the stored file for the search index (falls back to the file name)
async function storedText(doc) {
  try {
    const info = getFileInfo(doc.docId);
    if (!info) return doc.filename;
    const filePath = path.join(getUploadDir(), info.storedFilename);
    if (!fs.existsSync(filePath)) return doc.filename;
    return (await extractText(fs.readFileSync(filePath), doc.filename)) || doc.filename;
  } catch (e) {
    console.log('[Reindex] Text extraction failed for', doc.docId, e.message);
    return doc.filename;
  }
}

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
      // Regular users only find their own documents (same rule as the dashboard)
      uploader: req.user.role === 'admin' ? undefined : req.user.username,
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
    let withText = 0;
    for (const doc of documents) {
      const content = await storedText(doc);
      if (content !== doc.filename) withText++;
      // Keep the tags already in the index (they are not stored on the ledger)
      const tags = await searchService.getIndexedTags(doc.docId);
      await searchService.indexDocument({
        docId: doc.docId,
        filename: doc.filename,
        content,
        department: doc.department,
        docType: doc.docType,
        uploader: doc.uploader,
        registeredAt: doc.registeredAt,
        tags,
        status: doc.status,
      });
      count++;
    }
    res.json({ message: `Reindexed ${count} documents (${withText} with their full text).` });
  } catch (err) {
    console.error('[Reindex Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;