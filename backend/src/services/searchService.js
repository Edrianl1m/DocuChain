'use strict';

const { MeiliSearch } = require('meilisearch');

const client = new MeiliSearch({
  host: process.env.MEILI_HOST || 'http://localhost:7700',
  apiKey: process.env.MEILI_MASTER_KEY,
});

const INDEX_NAME = process.env.MEILI_INDEX || 'documents';

/**
 * Initialize the MeiliSearch index with DocuChain settings
 */
async function initSearch() {
  const index = client.index(INDEX_NAME);

  await index.updateSettings({
    searchableAttributes: [
      'filename',
      'content',        // extracted text from document
      'department',
      'docType',
      'uploader',
      'tags',
    ],
    filterableAttributes: ['department', 'docType', 'status', 'uploader'],
    sortableAttributes: ['registeredAt', 'filename'],
    displayedAttributes: [
      'docId', 'filename', 'department', 'docType',
      'uploader', 'registeredAt', 'status', 'tags',
    ],
  });

  console.log('[MeiliSearch] Index configured:', INDEX_NAME);
}

/**
 * Index a document for full-text search
 */
async function indexDocument({ docId, filename, content, department, docType, uploader, registeredAt, tags = [], status = 'active' }) {
  const index = client.index(INDEX_NAME);
  await index.addDocuments([{
    id: docId,       // MeiliSearch requires an 'id' field
    docId,
    filename,
    content,        // full text extracted from file (PDF/DOCX text)
    department,
    docType,
    uploader,
    registeredAt,
    tags,
    status,
  }],{ primaryKey: 'id' });
}

/**
 * Full-text search across document contents
 * @param {string} query - keyword or phrase
 * @param {object} options - filter, sort, limit
 */
async function searchDocuments(query, options = {}) {
  const index = client.index(INDEX_NAME);
  const { department, docType, tag, limit = 20, offset = 0 } = options;

  const filters = [];
  if (department) filters.push(`department = "${department}"`);
  if (docType) filters.push(`docType = "${docType}"`);
  if (tag) filters.push(`tags = "${tag}"`);

  return index.search(query || '', {
    limit,
    offset,
    filter: filters.length > 0 ? filters.join(' AND ') : undefined,
    attributesToHighlight: ['content', 'filename'],
    highlightPreTag: '<mark>',
    highlightPostTag: '</mark>',
  });
}

/**
 * Remove a document from search index
 */
async function removeFromIndex(docId) {
  const index = client.index(INDEX_NAME);
  await index.deleteDocument(docId);
}

/**
 * Update a document in the index
 */
async function updateIndex(docId, updates) {
  const index = client.index(INDEX_NAME);
  await index.updateDocuments([{ id: docId, docId, ...updates }]);
}

module.exports = { initSearch, indexDocument, searchDocuments, removeFromIndex, updateIndex };
