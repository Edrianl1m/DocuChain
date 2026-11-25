'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const explorer = require('../services/explorerService');

// When the Fabric network is down, answer with a clear message instead of a crash
function fabricUnavailable(res, err) {
  console.error('[Explorer] Fabric unavailable:', err.message);
  res.status(503).json({
    available: false,
    error: 'The Hyperledger Fabric network is not reachable, so the ledger cannot be read right now.',
    hint: 'Start the network (fabric-network/scripts/network-up.sh) and make sure the peer and crypto paths in backend/.env are correct, then refresh.',
    detail: err.message,
  });
}

// Regular users only see filenames of their own documents
function redact(block, user) {
  if (user.role === 'admin') return block;
  return {
    ...block,
    transactions: block.transactions.map(tx =>
      tx.user === user.username ? tx : { ...tx, filename: null }
    ),
  };
}

// ─── GET /api/explorer/blocks?page=1&limit=20 ────────────────────
router.get('/blocks', authenticate, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
  try {
    const result = await explorer.listBlocks({ page, limit });
    res.json({ available: true, ...result, blocks: result.blocks.map(b => redact(b, req.user)) });
  } catch (err) {
    fabricUnavailable(res, err);
  }
});

// ─── GET /api/explorer/blocks/:number ────────────────────────────
router.get('/blocks/:number', authenticate, async (req, res) => {
  const number = parseInt(req.params.number);
  if (Number.isNaN(number) || number < 0) {
    return res.status(400).json({ error: 'Block number must be a non-negative integer.' });
  }
  try {
    const info = await explorer.getChainInfo();
    if (number >= info.height) {
      return res.status(404).json({ available: true, error: `Block #${number} does not exist yet. Chain height is ${info.height}.` });
    }
    const result = await explorer.getBlock(number);
    res.json({ available: true, ...result, block: redact(result.block, req.user) });
  } catch (err) {
    fabricUnavailable(res, err);
  }
});

// ─── GET /api/explorer/validate ──────────────────────────────────
router.get('/validate', authenticate, async (req, res) => {
  try {
    const result = await explorer.validateChain();
    res.json({ available: true, ...result });
  } catch (err) {
    fabricUnavailable(res, err);
  }
});

module.exports = router;
