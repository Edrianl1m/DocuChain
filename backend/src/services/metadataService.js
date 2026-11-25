'use strict';

const { hashBuffer } = require('./hashingService');

/**
 * DocuChain — Metadata Hash
 *
 * The key PostgreSQL fields of a document (document_publications row) are
 * hashed with SHA-256 and the hash is stored on the ledger. Staff edits made
 * through the app update the hash on-chain at the same time; an edit made
 * directly in the database does not, so the next check reports it.
 *
 * Covered fields: title, classification (confidential / public / internal),
 * owner (uploader), resolution number and resolution date.
 */

const METADATA_VERSION = 'v1';

function text(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function bool(value) {
  return value === true || value === 'true' || value === '1' || value === 1 || value === 'on';
}

// Postgres returns DATEONLY as 'YYYY-MM-DD'; accept Date objects and ISO strings too
function dateOnly(value) {
  if (value === undefined || value === null || value === '') return '';
  if (value instanceof Date) return isNaN(value) ? '' : value.toISOString().slice(0, 10);
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d) ? s : d.toISOString().slice(0, 10);
}

function classificationOf(row) {
  if (bool(row.isConfidential)) return 'confidential';
  if (bool(row.isPublic)) return 'public';
  return 'internal';
}

/** The fields that are protected, in a fixed order. */
function metadataFields(row) {
  return {
    docId: text(row.docId),
    title: text(row.title),
    classification: classificationOf(row),
    owner: text(row.uploader),
    resolutionNumber: text(row.resolutionNumber),
    resolutionDate: dateOnly(row.resolutionDate),
  };
}

/** SHA-256 of the protected fields. `row` is a document_publications row or a plain object with the same keys. */
function computeMetadataHash(row) {
  if (!row) return null;
  const f = metadataFields(row.get ? row.get({ plain: true }) : row);
  const canonical = JSON.stringify([METADATA_VERSION, f.docId, f.title, f.classification, f.owner, f.resolutionNumber, f.resolutionDate]);
  return hashBuffer(Buffer.from(canonical, 'utf8'), 'sha256');
}

module.exports = { computeMetadataHash, metadataFields, classificationOf };
