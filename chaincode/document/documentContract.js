  'use strict';

  const { Contract } = require('fabric-contract-api');

  /**
   * DocuChain — Document Smart Contract
   *
   * Manages document hash records on the Hyperledger Fabric ledger.
   * Stores: document ID, filename, MD5, SHA-1, SHA-256, uploader,
   *         department, timestamp, version history.
   */
  class DocumentContract extends Contract {

    constructor() {
      super('DocumentContract');
    }

    // ─── Initialize ledger ───────────────────────────────────────
    async InitLedger(ctx) {
      console.log('DocuChain ledger initialized.');
      return JSON.stringify({ status: 'initialized' });
    }

    // ─── Register a new document ─────────────────────────────────
    async RegisterDocument(ctx, docId, filename, md5Hash, sha1Hash, sha256Hash, uploader, department, docType) {
      // Check if document already exists
      const existing = await ctx.stub.getState(docId);
      if (existing && existing.length > 0) {
        throw new Error(`Document ${docId} already registered on ledger.`);
      }

      const timestamp = new Date().toISOString();

      const documentRecord = {
        docId,
        filename,
        hashes: {
          md5: md5Hash,
          sha1: sha1Hash,
          sha256: sha256Hash,
        },
        uploader,
        department,
        docType,
        registeredAt: timestamp,
        lastVerifiedAt: null,
        versionHistory: [
          {
            version: 1,
            sha256Hash,
            updatedAt: timestamp,
            updatedBy: uploader,
          },
        ],
        status: 'active',
        tampered: false,
      };

      await ctx.stub.putState(docId, Buffer.from(JSON.stringify(documentRecord)));

      // Emit event for off-chain listeners
      ctx.stub.setEvent('DocumentRegistered', Buffer.from(JSON.stringify({
        docId,
        filename,
        uploader,
        timestamp,
      })));

      console.log(`Document registered: ${docId}`);
      return JSON.stringify(documentRecord);
    }

    // ─── Verify document integrity ───────────────────────────────
    async VerifyDocument(ctx, docId, currentSha256) {
      const recordBytes = await ctx.stub.getState(docId);
      if (!recordBytes || recordBytes.length === 0) {
        throw new Error(`Document ${docId} not found on ledger.`);
      }

      const record = JSON.parse(recordBytes.toString());
      const storedHash = record.hashes.sha256;
      const isIntact = storedHash === currentSha256;
      const timestamp = new Date().toISOString();

      // Update last verified timestamp and tamper status
      record.lastVerifiedAt = timestamp;
      record.tampered = !isIntact;
      await ctx.stub.putState(docId, Buffer.from(JSON.stringify(record)));

      const verificationResult = {
        docId,
        filename: record.filename,
        isIntact,
        storedHash,
        providedHash: currentSha256,
        verifiedAt: timestamp,
        uploader: record.uploader,
        registeredAt: record.registeredAt,
      };

      // Emit event
      ctx.stub.setEvent('DocumentVerified', Buffer.from(JSON.stringify(verificationResult)));

      return JSON.stringify(verificationResult);
    }

    // ─── Update document (new version) ──────────────────────────
    async UpdateDocument(ctx, docId, filename, md5Hash, sha1Hash, sha256Hash, updatedBy) {
      const recordBytes = await ctx.stub.getState(docId);
      if (!recordBytes || recordBytes.length === 0) {
        throw new Error(`Document ${docId} not found on ledger.`);
      }

      const record = JSON.parse(recordBytes.toString());
      const timestamp = new Date().toISOString();
      const newVersion = record.versionHistory.length + 1;

      
      record.versionHistory.push({
        version: newVersion,
        sha256Hash,
        updatedAt: timestamp,
        updatedBy,
      });


      record.filename = filename;
      record.hashes = { md5: md5Hash, sha1: sha1Hash, sha256: sha256Hash };
      record.tampered = false;

      await ctx.stub.putState(docId, Buffer.from(JSON.stringify(record)));
      return JSON.stringify(record);
    }

  
    async GetDocument(ctx, docId) {
      const recordBytes = await ctx.stub.getState(docId);
      if (!recordBytes || recordBytes.length === 0) {
        throw new Error(`Document ${docId} not found.`);
      }
      return recordBytes.toString();
    }

    // ─── Get document version history ────────────────────────────
    async GetDocumentHistory(ctx, docId) {
      const allResults = [];
      const iterator = await ctx.stub.getHistoryForKey(docId);

      let res = await iterator.next();
      while (!res.done) {
        const record = {
          txId: res.value.txId,
          timestamp: new Date(res.value.timestamp.seconds.low * 1000).toISOString(),
          isDelete: res.value.isDelete,
          value: res.value.value.toString(),
        };
        allResults.push(record);
        res = await iterator.next();
      }
      await iterator.close();

      return JSON.stringify(allResults);
    }

    async GetAllDocuments(ctx) {
      const iterator = await ctx.stub.getStateByRange('', '');
      const results = [];
      let res = await iterator.next();
    
      while (!res.done) {
        const record = JSON.parse(res.value.value.toString());
        if (record.status === 'active') {
          results.push(record);
        }
        res = await iterator.next();
      }
      await iterator.close();
    
      return JSON.stringify(results);
    }

    async GetTamperedDocuments(ctx) {
      const iterator = await ctx.stub.getStateByRange('', '');
      const results = [];
      let res = await iterator.next();
    
      while (!res.done) {
        const record = JSON.parse(res.value.value.toString());
        if (record.tampered === true) {
          results.push(record);
        }
        res = await iterator.next();
      }
      await iterator.close();
    
      return JSON.stringify(results);
    }

    // ─── Soft-delete / deactivate document ───────────────────────
    async DeactivateDocument(ctx, docId, deactivatedBy) {
      const recordBytes = await ctx.stub.getState(docId);
      if (!recordBytes || recordBytes.length === 0) {
        throw new Error(`Document ${docId} not found.`);
      }

      const record = JSON.parse(recordBytes.toString());
      record.status = 'inactive';
      record.deactivatedBy = deactivatedBy;
      record.deactivatedAt = new Date().toISOString();

      await ctx.stub.putState(docId, Buffer.from(JSON.stringify(record)));
      return JSON.stringify({ success: true, docId });
    }
  }

  module.exports = DocumentContract;
