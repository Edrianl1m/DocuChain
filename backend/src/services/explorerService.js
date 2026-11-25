'use strict';

const crypto = require('crypto');
const fabproto6 = require('fabric-protos');
const { BlockDecoder } = require('fabric-common');
const { withLedgerQueries, CHANNEL } = require('../config/fabric');

/**
 * DocuChain — Blockchain Explorer Service
 *
 * Reads blocks straight from the Hyperledger Fabric ledger through the
 * qscc system chaincode (read-only) and turns them into explorer rows:
 * block number, timestamp, document hash, previous hash, action and user.
 */

const VALIDATION_CODES = {
  0: 'VALID',
  1: 'NIL_ENVELOPE',
  2: 'BAD_PAYLOAD',
  4: 'BAD_CHANNEL_HEADER',
  5: 'BAD_CREATOR_SIGNATURE',
  10: 'ENDORSEMENT_POLICY_FAILURE',
  11: 'MVCC_READ_CONFLICT',
  12: 'PHANTOM_READ_CONFLICT',
  13: 'UNKNOWN_TX_TYPE',
  254: 'NOT_VALIDATED',
  255: 'INVALID_OTHER_REASON',
};

// Smart contract functions → explorer action + where the fields sit in the args
const CONTRACT_ACTIONS = {
  RegisterDocument:   { action: 'REGISTER',   docId: 1, filename: 2, sha256: 5, user: 6 },
  UpdateDocument:     { action: 'UPDATE',     docId: 1, filename: 2, sha256: 5, user: 6 },
  VerifyDocument:     { action: 'VERIFY',     docId: 1, sha256: 2 },
  DeactivateDocument: { action: 'DEACTIVATE', docId: 1, user: 2 },
  InitLedger:         { action: 'INIT' },
};

// ─── Hashing helpers ─────────────────────────────────────────────

function toBuffer(value) {
  if (!value) return Buffer.alloc(0);
  return Buffer.from(value);
}

function toBigInt(value) {
  if (value === undefined || value === null) return 0n;
  return BigInt(value.toString());
}

function derLength(length) {
  if (length < 128) return Buffer.from([length]);
  const bytes = [];
  while (length > 0) {
    bytes.unshift(length & 0xff);
    length >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function derInteger(value) {
  let hex = value.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  let bytes = Buffer.from(hex, 'hex');
  if (bytes[0] & 0x80) bytes = Buffer.concat([Buffer.from([0]), bytes]);
  return Buffer.concat([Buffer.from([0x02]), derLength(bytes.length), bytes]);
}

function derOctetString(bytes) {
  return Buffer.concat([Buffer.from([0x04]), derLength(bytes.length), bytes]);
}

/**
 * Fabric block hash = SHA-256 of the ASN.1 DER encoding of
 * { number, previous_hash, data_hash } (same as protoutil.BlockHeaderHash).
 */
function computeHeaderHash(header) {
  const body = Buffer.concat([
    derInteger(toBigInt(header.number)),
    derOctetString(toBuffer(header.previous_hash)),
    derOctetString(toBuffer(header.data_hash)),
  ]);
  const der = Buffer.concat([Buffer.from([0x30]), derLength(body.length), body]);
  return crypto.createHash('sha256').update(der).digest('hex');
}

/** Fabric data hash = SHA-256 of all transaction envelopes concatenated. */
function computeDataHash(dataEntries) {
  return crypto.createHash('sha256').update(Buffer.concat(dataEntries.map(toBuffer))).digest('hex');
}

// ─── Block decoding ──────────────────────────────────────────────

function creatorName(signatureHeader) {
  const creator = signatureHeader?.creator;
  if (!creator) return null;
  try {
    const cert = new crypto.X509Certificate(creator.id_bytes);
    const cn = /CN=([^\n,]+)/.exec(cert.subject);
    return cn ? cn[1] : creator.mspid;
  } catch {
    return creator.mspid || null;
  }
}

function decodeTransaction(envelope, index, validationCodes) {
  const channelHeader = envelope.payload.header.channel_header;
  const code = validationCodes[index];
  const tx = {
    txId: channelHeader.tx_id || null,
    type: channelHeader.typeString || String(channelHeader.type),
    timestamp: channelHeader.timestamp ? new Date(channelHeader.timestamp).toISOString() : null,
    creatorMsp: envelope.payload.header.signature_header?.creator?.mspid || null,
    creator: creatorName(envelope.payload.header.signature_header),
    validationCode: code === undefined ? null : (VALIDATION_CODES[code] || String(code)),
    chaincode: null,
    function: null,
    action: channelHeader.type === 1 ? 'CONFIG' : 'OTHER',
    docId: null,
    filename: null,
    documentHash: null,
    user: null,
  };

  const action = envelope.payload.data?.actions?.[0];
  const spec = action?.payload?.chaincode_proposal_payload?.input?.chaincode_spec;
  if (spec) {
    const args = (spec.input?.args || []).map(a => Buffer.from(a).toString('utf8'));
    const fcn = (args[0] || '').split(':').pop();
    tx.chaincode = spec.chaincode_id?.name || null;
    tx.function = fcn || null;

    const mapping = CONTRACT_ACTIONS[fcn];
    if (mapping) {
      tx.action = mapping.action;
      if (mapping.docId) tx.docId = args[mapping.docId] || null;
      if (mapping.filename) tx.filename = args[mapping.filename] || null;
      if (mapping.sha256) tx.documentHash = args[mapping.sha256] || null;
      if (mapping.user) tx.user = args[mapping.user] || null;
    } else if (tx.chaincode === '_lifecycle' || tx.chaincode === 'lscc') {
      tx.action = 'CHAINCODE LIFECYCLE';
    } else {
      tx.action = fcn ? fcn.toUpperCase() : 'INVOKE';
    }
  }
  if (!tx.user) tx.user = tx.creator;
  return tx;
}

/**
 * Decode raw block bytes (from qscc) into an explorer-friendly object.
 */
function summarizeBlock(blockBytes) {
  const raw = fabproto6.common.Block.decode(blockBytes);
  const decoded = BlockDecoder.decode(blockBytes);
  const validationCodes = decoded.metadata?.metadata?.[2] || [];

  const transactions = decoded.data.data.map((env, i) => decodeTransaction(env, i, validationCodes));
  const dataHash = toBuffer(raw.header.data_hash).toString('hex');
  const computedDataHash = computeDataHash(raw.data?.data || []);
  const main = transactions.find(t => t.docId) || transactions[0] || {};

  return {
    number: Number(toBigInt(raw.header.number)),
    timestamp: main.timestamp || null,
    blockHash: computeHeaderHash(raw.header),
    previousHash: toBuffer(raw.header.previous_hash).toString('hex'),
    dataHash,
    dataHashValid: dataHash === computedDataHash,
    txCount: transactions.length,
    action: main.action || null,
    documentHash: main.documentHash || null,
    docId: main.docId || null,
    user: main.user || null,
    transactions,
  };
}

function decodeChainInfo(infoBytes) {
  const info = fabproto6.common.BlockchainInfo.decode(infoBytes);
  return {
    channel: CHANNEL,
    height: Number(toBigInt(info.height)),
    currentBlockHash: toBuffer(info.currentBlockHash).toString('hex'),
    previousBlockHash: toBuffer(info.previousBlockHash).toString('hex'),
  };
}

// ─── Public API ──────────────────────────────────────────────────

async function getChainInfo() {
  return withLedgerQueries(async (query) => decodeChainInfo(await query('GetChainInfo')));
}

/**
 * Newest-first page of blocks.
 */
async function listBlocks({ page = 1, limit = 20 } = {}) {
  return withLedgerQueries(async (query) => {
    const info = decodeChainInfo(await query('GetChainInfo'));
    const top = info.height - 1 - (page - 1) * limit;
    const blocks = [];
    for (let n = top; n >= 0 && n > top - limit; n--) {
      blocks.push(summarizeBlock(await query('GetBlockByNumber', String(n))));
    }
    return { ...info, page, limit, blocks };
  });
}

async function getBlock(number) {
  return withLedgerQueries(async (query) => {
    const info = decodeChainInfo(await query('GetChainInfo'));
    const block = summarizeBlock(await query('GetBlockByNumber', String(number)));
    return { ...info, block };
  });
}

async function getBlockNumberByTxId(txId) {
  return withLedgerQueries(async (query) => {
    const raw = fabproto6.common.Block.decode(await query('GetBlockByTxID', txId));
    return Number(toBigInt(raw.header.number));
  });
}

/**
 * Walk the whole chain: every block's previous_hash must equal the
 * recomputed hash of the block before it, every data hash must match its
 * transactions, and the last block must match the peer's current hash.
 */
async function validateChain({ maxBlocks = parseInt(process.env.EXPLORER_MAX_VALIDATE_BLOCKS) || 5000 } = {}) {
  return withLedgerQueries(async (query) => {
    const info = decodeChainInfo(await query('GetChainInfo'));
    const start = Math.max(0, info.height - maxBlocks);
    const issues = [];
    let previousComputedHash = null;

    for (let n = start; n < info.height; n++) {
      const block = summarizeBlock(await query('GetBlockByNumber', String(n)));
      if (!block.dataHashValid) {
        issues.push({ block: n, problem: 'Data hash does not match the block transactions.' });
      }
      if (previousComputedHash !== null && block.previousHash !== previousComputedHash) {
        issues.push({ block: n, problem: `Previous hash does not match block #${n - 1}.` });
      }
      previousComputedHash = block.blockHash;
    }

    if (previousComputedHash !== null && previousComputedHash !== info.currentBlockHash) {
      issues.push({ block: info.height - 1, problem: 'Latest block hash differs from the peer chain info.' });
    }

    return {
      valid: issues.length === 0,
      checkedBlocks: info.height - start,
      fromBlock: start,
      height: info.height,
      currentBlockHash: info.currentBlockHash,
      issues,
      checkedAt: new Date().toISOString(),
    };
  });
}

module.exports = {
  getChainInfo,
  listBlocks,
  getBlock,
  getBlockNumberByTxId,
  validateChain,
  // exported for tests
  summarizeBlock,
  computeHeaderHash,
};
