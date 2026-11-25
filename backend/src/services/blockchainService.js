'use strict';

const { submitTransaction, evaluateTransaction } = require('../config/fabric');
const tor = require('./torService');

/**
 * DocuChain — Blockchain Service
 * Wraps all smart contract interactions
 */

async function registerDocument({ docId, filename, md5, sha1, sha256, uploader, department, docType, metadataHash }) {
  return submitTransaction('RegisterDocument', docId, filename, md5, sha1, sha256, uploader, department, docType, metadataHash || '');
}

/**
 * Ask the chaincode to compare hashes with the ledger.
 * Runs as a query first (fast, writes nothing). Only when the chaincode says
 * the tamper status changed (`needsRecord`) and `record` is allowed is the same
 * call submitted as a transaction, so the flag is written to the ledger.
 *
 * @param {string} docId
 * @param {object} opts
 * @param {string} opts.sha256        hash of the file just read ('' = not checked, 'missing' = file gone)
 * @param {string} [opts.metadataHash] hash of the PostgreSQL fields ('' = not checked)
 * @param {'stored'|'copy'} [opts.source]
 * @param {string} [opts.checkedBy]
 * @param {string} [opts.context]     download | view | scan | verify ...
 * @param {boolean} [opts.record=true] false = never write (public pages)
 */
async function verifyDocument(docId, { sha256 = '', metadataHash = '', source = 'stored', checkedBy = 'system', context = '', record = true } = {}) {
  const args = [docId, sha256 || '', metadataHash || '', source, checkedBy || 'system', context || ''];
  const result = await evaluateTransaction('VerifyDocument', ...args);
  if (!result.needsRecord || !record) return { ...result, recorded: false };
  const written = await submitTransaction('VerifyDocument', ...args);
  return { ...written, recorded: !!written.needsRecord };
}

async function updateMetadataHash(docId, metadataHash, updatedBy) {
  return submitTransaction('UpdateMetadataHash', docId, metadataHash, updatedBy);
}

async function updateDocument({ docId, filename, md5, sha1, sha256, updatedBy }) {
  return submitTransaction('UpdateDocument', docId, filename, md5, sha1, sha256, updatedBy);
}

// Old demo records carry pre-ToR labels; show them with the ToR names
async function getDocument(docId) {
  return tor.normalize(await evaluateTransaction('GetDocument', docId));
}

async function getDocumentHistory(docId) {
  return evaluateTransaction('GetDocumentHistory', docId);
}

async function getAllDocuments() {
  return (await evaluateTransaction('GetAllDocuments')).map(tor.normalize);
}

async function getTamperedDocuments() {
  return (await evaluateTransaction('GetTamperedDocuments')).map(tor.normalize);
}

async function deactivateDocument(docId, deactivatedBy) {
  return submitTransaction('DeactivateDocument', docId, deactivatedBy);
}

module.exports = {
  registerDocument,
  verifyDocument,
  updateMetadataHash,
  updateDocument,
  getDocument,
  getDocumentHistory,
  getAllDocuments,
  getTamperedDocuments,
  deactivateDocument,
};
