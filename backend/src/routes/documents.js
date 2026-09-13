'use strict';

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const upload = require('../middleware/upload');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { computeHashes, verifySha256 } = require('../services/hashingService');
const blockchain = require('../services/blockchainService');
const { indexDocument, removeFromIndex } = require('../services/searchService');
const { registerFile, getFileInfo, getUploadDir } = require('../services/storageService');

// ─── POST /api/documents/upload ──────────────────────────────────
router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const { department, docType, tags } = req.body;
    const docId = uuidv4();
    const filePath = req.file.path;

    // Compute MD5, SHA-1, SHA-256
    const hashes = computeHashes(filePath);

    // Register on blockchain
    const ledgerRecord = await blockchain.registerDocument({
      docId,
      filename: req.file.originalname,
      md5: hashes.md5,
      sha1: hashes.sha1,
      sha256: hashes.sha256,
      uploader: req.user.username,
      department: department || 'General',
      docType: docType || 'Document',
    });

    // Save file mapping (docId -> stored filename)
    registerFile(docId, req.file.filename, req.file.originalname, req.user.username);

    // Extract text content for full-text search
    let content = req.file.originalname;
    const ext = path.extname(req.file.originalname).toLowerCase();
    try {
      if (ext === '.pdf') {
        const pdfParse = require('pdf-parse');
        const dataBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(dataBuffer);
        content = pdfData.text;
      } else if (ext === '.docx' || ext === '.doc') {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ path: filePath });
        content = result.value;
      } else if (ext === '.txt' || ext === '.csv') {
        content = fs.readFileSync(filePath, 'utf8');
      }
    } catch (e) {
      console.log('[Search] Text extraction failed:', e.message);
      content = req.file.originalname;
    }

    await indexDocument({
      docId,
      filename: req.file.originalname,
      content,
      department: department || 'General',
      docType: docType || 'Document',
      uploader: req.user.username,
      registeredAt: new Date().toISOString(),
      tags: tags ? tags.split(',').map(t => t.trim()) : [],
    });

    res.status(201).json({
      message: 'Document uploaded and registered on blockchain.',
      docId,
      filename: req.file.originalname,
      hashes,
      ledgerRecord,
    });
  } catch (err) {
    console.error('[Upload Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/documents ───────────────────────────────────────────
// Admin: all documents | User: only their own
router.get('/', authenticate, async (req, res) => {
  try {
    const documents = await blockchain.getAllDocuments();
    if (req.user.role === 'admin') {
      return res.json({ documents });
    }
    // Regular users only see their own
    const own = documents.filter(d => d.uploader === req.user.username);
    res.json({ documents: own });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/documents/:id ───────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  try {
    const doc = await blockchain.getDocument(req.params.id);
    // Users can only view their own documents
    if (req.user.role !== 'admin' && doc.uploader !== req.user.username) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    res.json({ document: doc });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// ─── GET /api/documents/:id/download ─────────────────────────────
// Admin: any file | User: only their own uploaded files
router.get('/:id/download', authenticate, async (req, res) => {
  try {
    const docId = req.params.id;

    // Get ledger record to check uploader
    const ledgerDoc = await blockchain.getDocument(docId);

    // Permission check
    if (req.user.role !== 'admin' && ledgerDoc.uploader !== req.user.username) {
      return res.status(403).json({ error: 'Access denied. You can only download your own documents.' });
    }

    // Get stored filename from mapping
    const fileInfo = getFileInfo(docId);
    if (!fileInfo) {
      return res.status(404).json({ error: 'File not found on server. It may have been uploaded before file tracking was enabled.' });
    }

    const filePath = path.join(getUploadDir(), fileInfo.storedFilename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk.' });
    }

    // Send file with original filename
    res.download(filePath, fileInfo.originalFilename);
  } catch (err) {
    console.error('[Download Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/documents/:id/verify ──────────────────────────────
router.post('/:id/verify', authenticate, upload.single('file'), async (req, res) => {
  try {
    const docId = req.params.id;
    const ledgerDoc = await blockchain.getDocument(docId);

    let currentHash;
    if (req.file) {
      const hashes = computeHashes(req.file.path);
      currentHash = hashes.sha256;
    } else {
      currentHash = req.body.sha256 || ledgerDoc.hashes.sha256;
    }

    const verificationResult = await blockchain.verifyDocument(docId, currentHash);
    res.json({
      message: verificationResult.isIntact ? 'Document integrity verified — INTACT' : '⚠ TAMPER DETECTED',
      ...verificationResult,
    });
  } catch (err) {
    console.error('[Verify Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/documents/:id/history ──────────────────────────────
router.get('/:id/history', authenticate, async (req, res) => {
  try {
    const history = await blockchain.getDocumentHistory(req.params.id);
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/documents/:id ────────────────────────────────────
// Admin only
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await blockchain.deactivateDocument(req.params.id, req.user.username);
    await removeFromIndex(req.params.id);
    res.json({ message: 'Document deactivated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;