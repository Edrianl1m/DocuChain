# DocuChain tamper detection

## How it works

| When | What happens |
|---|---|
| **Upload** | The server computes the SHA-256 of the file and a SHA-256 of the key database fields (title, classification, owner, resolution no./date). `RegisterDocument` writes both to the ledger with the doc ID, uploader and the transaction timestamp. |
| **Every download or view** (staff Dashboard, public page view/download/thumbnail) | The stored file and its database row are re-hashed and the chaincode `VerifyDocument(id, fileHash, metadataHash, …)` compares them with the ledger. If they don't match, the file is **blocked** (HTTP 409, "Tampered") and the ledger record is flagged. An admin can still open it to investigate (logged). |
| **Scheduled integrity scan** | Every `INTEGRITY_SCAN_INTERVAL_MINUTES` (default 60, first run 1 minute after start-up) every active document is re-hashed and checked, so tampering is caught even if nobody opens the file. Admins can also press **Run integrity scan** on the Audit Trail. |
| **Metadata** | Edits made in the app (Upload, Public Page settings) write the new metadata hash to the ledger in the same step (`UpdateMetadataHash`). An edit made directly in PostgreSQL does not, so the next check reports "database details changed". |
| **Audit trail** | Every verification, pass or fail, is written to the `integrity_logs` table and shown on Audit Trail → **Integrity checks**. Scans are in `integrity_scans`. |
| **Admin alert** | On a new failure the alert is printed in the backend log, shown on the Dashboard, and (optional) sent to `ADMIN_ALERT_WEBHOOK_URL` (Discord/Slack/Teams webhook or any URL accepting a JSON POST). The same alert is not repeated within an hour. |

Notes:
- `VerifyDocument` is first run as a **query** (nothing written, fast). Only when the tamper status changes (intact → tampered, or tampered → restored) is it submitted as a transaction, so the ledger holds a `tamperEvents` history without one block per download.
- On the Verify page, checking an **uploaded copy** that differs does *not* flag the record (the copy is wrong, not the record). Leaving the file empty checks the copy stored on the server.
- If the stored file is put back (e.g. from a backup) the next check clears the flag and records a "restored" event.
- When a document's details were changed outside DocuChain, only an admin can save them again on the Public Page screen (so the changes can't be quietly accepted).
- The old unauthenticated `/files` static route is now off (it skipped the check). `ENABLE_STATIC_FILES=true` turns it back on.

## Redeploy (required once)

The chaincode changed, so it must be upgraded on the running network. Upgrading **keeps** all documents already on the ledger.

1. Start Docker Desktop and make sure the Fabric network is up (`docker ps` shows the peer and orderer). If it isn't, start it with `docker compose -f docker-compose-fabric.yml up -d` from `fabric-network/`. **Do not run `network-down.sh`**: it erases the ledger.
2. In Git Bash:
   ```bash
   cd ~/Downloads/capstone/docuchain/fabric-network
   CC_VERSION=2.0 ./scripts/deploy-chaincode.sh
   ```
   The script now finds the current sequence number and uses the next one. Each later redeploy needs a new version (`CC_VERSION=2.1`, …). The first run builds the chaincode container, which takes a few minutes.
3. Restart the backend (`cd backend && npm run dev`). The new tables `integrity_logs` and `integrity_scans` are created automatically. No new npm packages are needed.
4. Restart the frontend (`cd frontend && npm run dev`).
5. Log in as admin → **Audit Trail** → press **Anchor metadata (N)** once. This writes a metadata hash for documents uploaded before this change (their current database values are taken as correct). Then press **Run integrity scan**.

Optional `.env` settings (backend):
```
INTEGRITY_SCAN_INTERVAL_MINUTES=60     # 0 turns the automatic scan off
ADMIN_ALERT_WEBHOOK_URL=               # e.g. a Discord channel webhook URL
```

The backend must run with the new chaincode: with the old one, uploads fail (argument count) and downloads answer "integrity check could not run".

## Demo script

1. Upload a document (e.g. a PDF, mark it public). Download it from the Dashboard → works, Audit Trail → Integrity checks shows UPLOAD and DOWNLOAD as PASS.
2. **File tampering:** open `docuchain/uploads/`, edit the stored copy (or replace it with another file of the same name). Download again → "Tampered — file blocked". The public page "View" shows "Tampered document withheld".
3. **Database tampering:** in psql/pgAdmin run
   `UPDATE document_publications SET title = 'Edited in DB' WHERE "docId" = '<id>';`
   Download → blocked, reason "database details changed". Verify page shows the ledger vs computed metadata hash.
4. **Scheduled scan:** tamper another file without opening it, press **Run integrity scan** (or wait for the schedule) → it is caught and listed under Failures only.
5. Put the original file / value back → next check passes and the ledger records "restored".

## Rollback

Original versions of every changed file are in `capstone/docuchain-backup-tamper-2026-11-11/`. Copy them back and redeploy the chaincode with a new version number (e.g. `CC_VERSION=2.1`).
