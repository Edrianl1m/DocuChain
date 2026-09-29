---
name: fabric-audit-validation
description: Implement or review DocuChain Hyperledger Fabric document integrity and audit-history behavior while preserving deterministic ledger records.
---

# Fabric Audit Validation

Use this skill for changes to DocuChain chaincode transactions, blockchain service wrappers, integrity verification, tamper reporting, document history, or audit endpoints. Do not use it for ordinary database or search-only changes.

## Maintain the ledger interface

- Keep the transaction names, argument order, and response shapes in `chaincode/document/documentContract.js` aligned with the wrappers in `backend/src/services/blockchainService.js`.
- Preserve compatibility with existing document records: `docId`, `filename`, `hashes`, `uploader`, `department`, `docType`, registration and verification fields, `versionHistory`, `status`, and `tampered`.
- Keep write operations as submitted Fabric transactions and read-only operations as evaluated transactions. Do not make a query mutate ledger state.
- Use transaction-provided timestamps for new chaincode timestamp behavior so endorsements remain deterministic. Do not introduce wall-clock time into new transaction logic.
- Serialize record values consistently and close Fabric iterators after state or history scans.

## Integrity and audit rules

- Treat SHA-256 comparison as the integrity decision. Verification must record whether the supplied hash matches the registered hash and must preserve the registered hash values.
- A mismatch sets the document's tamper state; a successful document update creates the next version-history entry and clears the tamper state only when the update is authorized by the requested workflow.
- Keep deactivation as a soft delete so audit and history data remain available. Do not silently remove ledger state or change inactive documents back to active without an explicit transaction and authorization design.
- Return history in transaction order with transaction IDs, timestamps, deletion status, and serialized historical values. Keep audit reporting scoped to authenticated backend callers.

## Validate changes

Review chaincode, `backend/src/services/blockchainService.js`, and the relevant routes together. Run syntax and focused contract checks when available; end-to-end validation requires an operational Fabric network and should not start or regenerate network artifacts as routine validation.
