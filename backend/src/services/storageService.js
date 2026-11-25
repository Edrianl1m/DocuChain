  'use strict';

const fs = require('fs');
const path = require('path');

const MAP_FILE = path.resolve(__dirname, '..', '..', 'uploads', 'file-map.json');
const UPLOAD_DIR = path.resolve(__dirname, '..', '..', '..', 'uploads');

function loadMap() {
  if (!fs.existsSync(MAP_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(MAP_FILE, 'utf8')); }
  catch { return {}; }
}

function saveMap(map) {
  const dir = path.dirname(MAP_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(MAP_FILE, JSON.stringify(map, null, 2));
}

function registerFile(docId, storedFilename, originalFilename, uploader) {
  const map = loadMap();
  map[docId] = { storedFilename, originalFilename, uploader };
  saveMap(map);
}

/**
 * Versions of a document's file. Documents registered before versioning have
 * no list yet: their single file is version 1.
 * @returns {Array<{version, storedFilename, originalFilename, uploadedBy, uploadedAt, sha256}>}
 */
function listVersionFiles(docId) {
  const entry = loadMap()[docId];
  if (!entry) return [];
  if (Array.isArray(entry.versions) && entry.versions.length) return entry.versions;
  return [{ version: 1, storedFilename: entry.storedFilename, originalFilename: entry.originalFilename, uploadedBy: entry.uploader, uploadedAt: null, sha256: null }];
}

/**
 * Record a new version: the new file becomes the current one (used by
 * downloads and integrity checks) and older files are kept in `versions`.
 */
function addVersionFile(docId, { version, storedFilename, originalFilename, uploadedBy, sha256 }) {
  const map = loadMap();
  const entry = map[docId];
  if (!entry) throw new Error('No stored file for this document.');
  const versions = Array.isArray(entry.versions) && entry.versions.length
    ? entry.versions
    : [{ version: 1, storedFilename: entry.storedFilename, originalFilename: entry.originalFilename, uploadedBy: entry.uploader, uploadedAt: null, sha256: null }];
  versions.push({ version, storedFilename, originalFilename, uploadedBy, uploadedAt: new Date().toISOString(), sha256 });
  map[docId] = { ...entry, storedFilename, originalFilename, versions };
  saveMap(map);
  return map[docId];
}

function getFileInfo(docId) {
  const map = loadMap();
  return map[docId] || null;
}

function getUploadDir() {
  return UPLOAD_DIR;
}

module.exports = { registerFile, getFileInfo, getUploadDir, listVersionFiles, addVersionFile };
