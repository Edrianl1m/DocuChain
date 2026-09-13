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

function getFileInfo(docId) {
  const map = loadMap();
  return map[docId] || null;
}

function getUploadDir() {
  return UPLOAD_DIR;
}

module.exports = { registerFile, getFileInfo, getUploadDir };
