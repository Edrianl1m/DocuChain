'use strict';

const { Contract } = require('fabric-contract-api');

/**
 * DocuChain — Document Smart Contract
 *
 * Manages document hash records on the Hyperledger Fabric ledger.
 * Stores: document ID, filename, MD5, SHA-1, SHA-256, uploader,
 *         department, timestamp, version history, and a SHA-256 of the
 *         document's key PostgreSQL metadata (title, classification, owner)
 *         so edits made directly in the database can be detected.
 *
 * Verification sources:
 *   'stored' — the copy kept on the server (download, view, scheduled scan).
 *              A mismatch means the record itself was tampered with.
 *   'copy'   — a file someone uploaded to compare. A mismatch only means that
 *              copy differs; the record is not flagged because of it.
 */
class DocumentContract extends Contract {

  constructor() {
    super('DocumentContract');
  }

  // Transaction time agreed by the network (new Date() can differ per peer)
  _txTime(ctx) {
    const ts = ctx.stub.getTxTimestamp();
    const seconds = typeof ts.seconds === 'object' && ts.seconds !== null && 'low' in ts.seconds
      ? ts.seconds.low : Number(ts.seconds);
    return new Date(seconds * 1000 + Math.floor((ts.nanos || 0) / 1e6)).toISOString();
  }

  async _get(ctx, docId) {
    const recordBytes = await ctx.stub.getState(docId);
    if (!recordBytes || recordBytes.length === 0) {
      throw new Error(`Document ${docId} not found on ledger.`);
    }
    return JSON.parse(recordBytes.toString());
  }

  // ─── Initialize ledger ───────────────────────────────────────
  async InitLedger(ctx) {
    console.log('DocuChain ledger initialized.');
    return JSON.stringify({ status: 'initialized' });
  }

  // ─── Register a new document ─────────────────────────────────
  async RegisterDocument(ctx, docId, filename, md5Hash, sha1Hash, sha256Hash, uploader, department, docType, metadataHash) {
    const existing = await ctx.stub.getState(docId);
    if (existing && existing.length > 0) {
      throw new Error(`Document ${docId} already registered on ledger.`);
    }

    const timestamp = this._txTime(ctx);

    const documentRecord = {
      docId,
      filename,
      hashes: {
        md5: md5Hash,
        sha1: sha1Hash,
        sha256: sha256Hash,
      },
      metadataHash: metadataHash || null,
      metadataUpdatedAt: metadataHash ? timestamp : null,
      metadataUpdatedBy: metadataHash ? uploader : null,
      uploader,
      department,
      docType,
      registeredAt: timestamp,
      registeredTxId: ctx.stub.getTxID(),
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
      tamperReasons: [],
      tamperedAt: null,
      tamperEvents: [],
    };

    await ctx.stub.putState(docId, Buffer.from(JSON.stringify(documentRecord)));

    ctx.stub.setEvent('DocumentRegistered', Buffer.from(JSON.stringify({
      docId,
      filename,
      uploader,
      timestamp,
    })));

    return JSON.stringify(documentRecord);
  }

  // ─── Verify document integrity ───────────────────────────────
  /**
   * Compare a freshly computed file hash (and optionally metadata hash) with
   * the values on the ledger.
   *
   * The backend first runs this as a query (nothing is written). Only when the
   * result says `needsRecord` (the tamper status changed) is it submitted as a
   * transaction, which writes the new status and a tamper event to the ledger.
   *
   * @param {string} currentSha256        hash of the file just read ('' = not checked, 'missing' = file gone)
   * @param {string} currentMetadataHash  hash of the database fields ('' = not checked, 'missing' = row gone)
   * @param {string} source               'stored' | 'copy'
   * @param {string} checkedBy            username, 'public' or 'system'
   * @param {string} context              what triggered the check (download, view, scan, verify...)
   */
  async VerifyDocument(ctx, docId, currentSha256, currentMetadataHash, source, checkedBy, context) {
    const record = await this._get(ctx, docId);
    const timestamp = this._txTime(ctx);
    const src = source === 'copy' ? 'copy' : 'stored';

    const storedHash = record.hashes.sha256;
    const fileChecked = !!currentSha256;
    const fileIntact = fileChecked ? storedHash === currentSha256 : null;

    const storedMetadataHash = record.metadataHash || null;
    const metadataChecked = !!currentMetadataHash && !!storedMetadataHash;
    const metadataIntact = metadataChecked ? storedMetadataHash === currentMetadataHash : null;

    // Only the server's own copy and the database metadata say something
    // about the record itself; a mismatching uploaded copy does not.
    const reasons = [];
    if (src === 'stored' && fileIntact === false) reasons.push(currentSha256 === 'missing' ? 'file_missing' : 'file');
    if (metadataIntact === false) reasons.push(currentMetadataHash === 'missing' ? 'metadata_missing' : 'metadata');

    const wasTampered = record.tampered === true;
    // A check that covers both parts can clear the flag; a partial check
    // (e.g. only an uploaded copy) can add a reason but not clear one.
    const fullCheck = src === 'stored' && fileChecked && (metadataChecked || !storedMetadataHash);
    let newReasons;
    if (fullCheck) newReasons = reasons;
    else newReasons = Array.from(new Set([...(record.tamperReasons || []), ...reasons]));
    const nowTampered = newReasons.length > 0;

    const prevReasons = (record.tamperReasons || []).slice().sort().join(',');
    const needsRecord = nowTampered !== wasTampered || (nowTampered && newReasons.slice().sort().join(',') !== prevReasons);

    if (needsRecord) {
      record.tampered = nowTampered;
      record.tamperReasons = newReasons;
      record.lastVerifiedAt = timestamp;
      if (nowTampered && !wasTampered) record.tamperedAt = timestamp;
      record.tamperEvents = record.tamperEvents || [];
      record.tamperEvents.push({
        type: nowTampered ? 'tampered' : 'restored',
        reasons: newReasons,
        at: timestamp,
        txId: ctx.stub.getTxID(),
        source: src,
        context: context || null,
        checkedBy: checkedBy || null,
        providedHash: currentSha256 || null,
        providedMetadataHash: currentMetadataHash || null,
      });
      if (!nowTampered) record.restoredAt = timestamp;
      await ctx.stub.putState(docId, Buffer.from(JSON.stringify(record)));
    }

    const verificationResult = {
      docId,
      filename: record.filename,
      source: src,
      isIntact: fileIntact !== false,      // file part (kept for older callers)
      fileIntact,
      metadataIntact,
      metadataAnchored: !!storedMetadataHash,
      storedHash,
      providedHash: currentSha256 || null,
      storedMetadataHash,
      providedMetadataHash: currentMetadataHash || null,
      tampered: nowTampered,
      tamperReasons: newReasons,
      wasTampered,
      needsRecord,
      verifiedAt: timestamp,
      uploader: record.uploader,
      registeredAt: record.registeredAt,
    };

    if (needsRecord) {
      ctx.stub.setEvent(nowTampered ? 'DocumentTampered' : 'DocumentRestored', Buffer.from(JSON.stringify(verificationResult)));
    }

    return JSON.stringify(verificationResult);
  }

  // ─── Record a legitimate metadata change ─────────────────────
  // Called by the backend whenever staff edit title / classification / owner
  // through the app, so only changes made outside the app are detected.
  async UpdateMetadataHash(ctx, docId, metadataHash, updatedBy) {
    const record = await this._get(ctx, docId);
    const timestamp = this._txTime(ctx);
    record.metadataHash = metadataHash;
    record.metadataUpdatedAt = timestamp;
    record.metadataUpdatedBy = updatedBy;
    record.metadataHistory = record.metadataHistory || [];
    record.metadataHistory.push({ metadataHash, updatedAt: timestamp, updatedBy, txId: ctx.stub.getTxID() });
    // A metadata-only tamper flag is cleared by an authorised re-anchor
    if (record.tampered && (record.tamperReasons || []).every(r => r.startsWith('metadata'))) {
      record.tampered = false;
      record.tamperReasons = [];
      record.restoredAt = timestamp;
      record.tamperEvents = record.tamperEvents || [];
      record.tamperEvents.push({ type: 'restored', reasons: [], at: timestamp, txId: ctx.stub.getTxID(), source: 'metadata_update', checkedBy: updatedBy });
    }
    await ctx.stub.putState(docId, Buffer.from(JSON.stringify(record)));
    return JSON.stringify(record);
  }

  // ─── Update document (new version) ──────────────────────────
  async UpdateDocument(ctx, docId, filename, md5Hash, sha1Hash, sha256Hash, updatedBy) {
    const record = await this._get(ctx, docId);
    const timestamp = this._txTime(ctx);
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
    record.tamperReasons = [];

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
      if (record.tampered === true && record.status === 'active') {
        results.push(record);
      }
      res = await iterator.next();
    }
    await iterator.close();

    return JSON.stringify(results);
  }

  // ─── Soft-delete / deactivate document ───────────────────────
  async DeactivateDocument(ctx, docId, deactivatedBy) {
    const record = await this._get(ctx, docId);
    record.status = 'inactive';
    record.deactivatedBy = deactivatedBy;
    record.deactivatedAt = this._txTime(ctx);

    await ctx.stub.putState(docId, Buffer.from(JSON.stringify(record)));
    return JSON.stringify({ success: true, docId });
  }
}

module.exports = DocumentContract;
