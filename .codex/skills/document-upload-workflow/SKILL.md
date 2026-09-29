---
name: document-upload-workflow
description: Implement or review DocuChain document upload, storage, indexing, and retrieval flows while preserving authorization and integrity records.
---

# Document Upload Workflow

Use this skill for changes to document upload, download, verification, storage, metadata, or search indexing in DocuChain. Do not use it for unrelated authentication or general UI work.

## Preserve the upload contract

- Keep upload handling in `backend/src/routes/documents.js`, storage configuration in `backend/src/middleware/upload.js`, file-map operations in `backend/src/services/storageService.js`, hashing in `backend/src/services/hashingService.js`, and search integration in `backend/src/services/searchService.js`.
- Require `authenticate` before upload, download, verification, metadata, or history actions. Enforce server-side ownership checks for non-admin users and use `requireAdmin` for administrative-only actions.
- Generate one document ID per upload. Preserve the linkage between that ID, the ledger record, the UUID-based stored filename, and the original filename in `uploads/file-map.json`.
- Compute and submit MD5, SHA-1, and SHA-256 hashes with the ledger registration. Do not treat client-supplied hashes as authoritative for newly uploaded files.
- Preserve the upload middleware's file-type and size restrictions unless the request explicitly changes them. Reject missing files and unsupported types with clear client errors.

## Coordinate side effects

For a successful upload, keep this order unless the request requires a deliberate recovery design: persist the file, compute hashes, register the ledger document, save the file map, then index searchable content. If a new failure path can leave an orphaned file, mapping, ledger record, or search entry, identify and handle the affected side effects deliberately.

- Extract searchable text only for formats already supported by the service; fall back to the filename when extraction fails.
- Keep department and document type defaults compatible with the ledger record, and normalize tags consistently before indexing.
- Download responses must use the mapped stored filename but provide the original filename to the client.
- Verification compares the provided or recomputed SHA-256 value against the ledger record through `blockchainService`; it must not overwrite the original document hashes.

## Validate changes

Inspect the affected route, middleware, storage, hashing, blockchain, and search boundaries together. For backend changes, run an applicable syntax or focused behavior check; full upload validation requires the configured PostgreSQL, MeiliSearch, and Fabric services.
