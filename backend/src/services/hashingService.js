'use strict';

const crypto = require('crypto');
const fs = require('fs');

/**
 * DocuChain Hashing Service
 *
 * Computes MD5, SHA-1, and SHA-256 for a given file.
 * All three are stored on the blockchain per Chapter 1 objectives.
 */

/**
 * Compute a single hash for a file buffer
 * @param {Buffer} fileBuffer
 * @param {'md5'|'sha1'|'sha256'} algorithm
 * @returns {string} hex digest
 */
function hashBuffer(fileBuffer, algorithm) {
  return crypto.createHash(algorithm).update(fileBuffer).digest('hex');
}

/**
 * Compute all three hashes for an uploaded file
 * @param {string} filePath - absolute path to the file on disk
 * @returns {{ md5: string, sha1: string, sha256: string }}
 */
function computeHashes(filePath) {
  const buffer = fs.readFileSync(filePath);

  return {
    md5: hashBuffer(buffer, 'md5'),
    sha1: hashBuffer(buffer, 'sha1'),
    sha256: hashBuffer(buffer, 'sha256'),
  };
}

/**
 * Compute hashes from a buffer (for in-memory verification)
 * @param {Buffer} buffer
 * @returns {{ md5: string, sha1: string, sha256: string }}
 */
function computeHashesFromBuffer(buffer) {
  return {
    md5: hashBuffer(buffer, 'md5'),
    sha1: hashBuffer(buffer, 'sha1'),
    sha256: hashBuffer(buffer, 'sha256'),
  };
}

/**
 * Verify a file against a known SHA-256 hash
 * @param {string} filePath
 * @param {string} expectedSha256
 * @returns {{ isIntact: boolean, currentHash: string }}
 */
function verifySha256(filePath, expectedSha256) {
  const buffer = fs.readFileSync(filePath);
  const currentHash = hashBuffer(buffer, 'sha256');
  return {
    isIntact: currentHash === expectedSha256,
    currentHash,
  };
}

module.exports = {
  computeHashes,
  computeHashesFromBuffer,
  verifySha256,
  hashBuffer,
};
