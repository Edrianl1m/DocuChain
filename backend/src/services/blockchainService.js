'use strict';

const { submitTransaction, evaluateTransaction } = require('../config/fabric');

/**
 * DocuChain — Blockchain Service
 * Wraps all smart contract interactions
 */

async function registerDocument({ docId, filename, md5, sha1, sha256, uploader, department, docType }) {
  return submitTransaction('RegisterDocument', docId, filename, md5, sha1, sha256, uploader, department, docType);
}

async function verifyDocument(docId, currentSha256) {
  return submitTransaction('VerifyDocument', docId, currentSha256);
}

async function updateDocument({ docId, filename, md5, sha1, sha256, updatedBy }) {
  return submitTransaction('UpdateDocument', docId, filename, md5, sha1, sha256, updatedBy);
}

async function getDocument(docId) {
  return evaluateTransaction('GetDocument', docId);
}

async function getDocumentHistory(docId) {
  return evaluateTransaction('GetDocumentHistory', docId);
}

async function getAllDocuments() {
  return evaluateTransaction('GetAllDocuments');
}

async function getTamperedDocuments() {
  return evaluateTransaction('GetTamperedDocuments');
}

async function deactivateDocument(docId, deactivatedBy) {
  return submitTransaction('DeactivateDocument', docId, deactivatedBy);
}

module.exports = {
  registerDocument,
  verifyDocument,
  updateDocument,
  getDocument,
  getDocumentHistory,
  getAllDocuments,
  getTamperedDocuments,
  deactivateDocument,
};
