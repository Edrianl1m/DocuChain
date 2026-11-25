'use strict';

const fs = require('fs');
const path = require('path');
const { hashBuffer } = require('./hashingService');
const { getFileInfo, getUploadDir } = require('./storageService');

/**
 * DocuChain Content Comparison
 *
 * The SHA-256 on the ledger covers the exact bytes of a file. Re-creating a
 * document (copy-pasting its text into a new Word/PDF file) changes those
 * bytes even when the words are the same, so the file check fails.
 *
 * When the file check fails, this compares the *text* of the uploaded file
 * with the text of the registered original. The original is only trusted
 * after its own bytes are confirmed against the ledger hash, so the result
 * is still anchored on the blockchain.
 */

const TEXT_TYPES = ['.pdf', '.docx', '.txt', '.csv'];

/** Extract plain text from a file buffer. Returns null for unsupported types. */
async function extractText(buffer, filename) {
  const ext = path.extname(filename || '').toLowerCase();
  if (ext === '.pdf') {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      // pdf-parse adds "-- 1 of 3 --" page markers; they are not document text
      return result.text.replace(/^-- \d+ of \d+ --$/gm, '');
    } finally {
      await parser.destroy();
    }
  }
  if (ext === '.docx') {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if (ext === '.txt' || ext === '.csv') {
    return buffer.toString('utf8').replace(/^﻿/, '');
  }
  return null;
}

/**
 * Normalize text so that differences a copy-paste introduces on its own
 * (line wrapping, spacing, curly vs straight quotes, ligatures, list bullets)
 * are ignored, while any change to the actual characters is not.
 */
function normalizeText(text) {
  return text
    .normalize('NFKC')
    .replace(/[​-‍⁠﻿­]/g, '')   // zero-width chars, soft hyphen
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/[•●◦▪▫‣⁃]/g, ' ') // bullets
    .replace(/\s+/g, ' ')
    .trim();
}

/** Text with all whitespace removed, plus a map back to positions in `spaced`. */
function compact(spaced) {
  let chars = '';
  const map = [];
  for (let i = 0; i < spaced.length; i++) {
    if (spaced[i] !== ' ') { chars += spaced[i]; map.push(i); }
  }
  return { chars, map };
}

function excerpt(spaced, map, index) {
  const at = index < map.length ? map[index] : spaced.length;
  const start = Math.max(0, at - 40);
  return (start > 0 ? '…' : '') + spaced.slice(start, at + 40) + (at + 40 < spaced.length ? '…' : '');
}

/**
 * Compare the text of a provided file with the registered original.
 * @param {string} docId
 * @param {string} ledgerSha256  SHA-256 of the original, read from the ledger
 * @param {Buffer} providedBuffer
 * @param {string} providedName  original filename of the provided file
 * @param {{storedFilename: string, originalFilename: string}} [file]  compare with
 *   this stored file instead of the current one (e.g. an older version, whose
 *   SHA-256 is then passed as ledgerSha256)
 * @returns {Promise<{status: 'identical'|'changed'|'unavailable', reason?: string,
 *   contentHash?: string, originalContentHash?: string,
 *   firstDifference?: { original: string, provided: string }}>}
 */
async function compareContent(docId, ledgerSha256, providedBuffer, providedName, file = null) {
  const info = file && file.storedFilename ? file : getFileInfo(docId);
  const originalPath = info && path.join(getUploadDir(), info.storedFilename);
  if (!info || !fs.existsSync(originalPath)) {
    return { status: 'unavailable', reason: 'The registered original is not stored on this server.' };
  }

  const originalBuffer = fs.readFileSync(originalPath);
  if (hashBuffer(originalBuffer, 'sha256') !== ledgerSha256) {
    return { status: 'unavailable', reason: 'The stored original no longer matches its ledger hash, so its text cannot be trusted for comparison.' };
  }

  const exts = [info.originalFilename, providedName].map(n => path.extname(n || '').toLowerCase());
  if (!exts.every(e => TEXT_TYPES.includes(e))) {
    return { status: 'unavailable', reason: 'Content comparison supports PDF, DOCX, TXT and CSV files.' };
  }

  let originalText, providedText;
  try {
    originalText = normalizeText(await extractText(originalBuffer, info.originalFilename));
    providedText = normalizeText(await extractText(providedBuffer, providedName));
  } catch (err) {
    return { status: 'unavailable', reason: `Could not read the text of the file (${err.message}).` };
  }
  if (!originalText || !providedText) {
    return { status: 'unavailable', reason: 'One of the files has no readable text (for example, a scanned image).' };
  }

  const a = compact(originalText);
  const b = compact(providedText);
  const result = {
    originalContentHash: hashBuffer(Buffer.from(a.chars, 'utf8'), 'sha256'),
    contentHash: hashBuffer(Buffer.from(b.chars, 'utf8'), 'sha256'),
  };
  if (a.chars === b.chars) return { status: 'identical', ...result };

  let i = 0;
  while (i < a.chars.length && i < b.chars.length && a.chars[i] === b.chars[i]) i++;
  return {
    status: 'changed',
    ...result,
    firstDifference: { original: excerpt(originalText, a.map, i), provided: excerpt(providedText, b.map, i) },
  };
}

/**
 * Whether a provided file keeps the registered file name. Case and the
 * " (1)" suffix browsers add to repeated downloads are ignored.
 */
function sameFileName(registeredName, providedName) {
  const clean = n => (n || '').trim().toLowerCase().replace(/\s*\(\d+\)(?=\.[^.]+$|$)/, '');
  return clean(registeredName) === clean(providedName);
}

module.exports = { extractText, normalizeText, compareContent, sameFileName };
