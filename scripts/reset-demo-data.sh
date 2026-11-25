#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# DocuChain — Start fresh: new blockchain, no documents, no logs
#
# Run in Git Bash from the docuchain folder, with Docker Desktop running
# and the BACKEND STOPPED:   ./scripts/reset-demo-data.sh
#
# Removes: every document on the Fabric ledger (the network is rebuilt
# from block 0), the uploaded files, the publication / public-access /
# integrity log tables in PostgreSQL, and the MeiliSearch index.
# Keeps:   user accounts (users table) and all code.
# ─────────────────────────────────────────────────────────────────
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Read DB / MeiliSearch settings from backend/.env
env_value() { grep -E "^$1=" backend/.env | head -1 | cut -d= -f2- | tr -d '\r"'; }
DB_NAME="$(env_value DB_NAME)"; DB_USER="$(env_value DB_USER)"
MEILI_HOST="$(env_value MEILI_HOST)"; MEILI_KEY="$(env_value MEILI_MASTER_KEY)"; MEILI_INDEX="$(env_value MEILI_INDEX)"
MEILI_HOST="${MEILI_HOST:-http://localhost:7700}"; MEILI_INDEX="${MEILI_INDEX:-documents}"

if [ "$1" != "--yes" ]; then
  echo "This deletes ALL documents, the blockchain ledger, uploaded files and audit logs."
  echo "User accounts are kept. Make sure the backend is stopped."
  read -r -p "Type RESET to continue: " answer
  [ "$answer" = "RESET" ] || { echo "Cancelled."; exit 1; }
fi

echo ""
echo "[1/5] Rebuilding the Fabric network (new ledger)..."
cd "$ROOT/fabric-network"
./scripts/network-down.sh
./scripts/network-up.sh
CC_VERSION=1.0 CC_SEQUENCE=1 ./scripts/deploy-chaincode.sh
cd "$ROOT"

echo "[2/5] Clearing PostgreSQL document tables (users are kept)..."
for table in document_publications public_access_logs integrity_logs integrity_scans; do
  docker exec docuchain-postgres psql -U "$DB_USER" -d "$DB_NAME" -q -c "TRUNCATE TABLE $table;" 2>/dev/null \
    && echo "      ✓ $table" || echo "      - $table (not present, skipped)"
done

echo "[3/5] Clearing the MeiliSearch index..."
curl -s -o /dev/null -w "      HTTP %{http_code}\n" -X DELETE "$MEILI_HOST/indexes/$MEILI_INDEX" -H "Authorization: Bearer $MEILI_KEY" || true

echo "[4/5] Removing uploaded files..."
find "$ROOT/uploads" -maxdepth 1 -type f ! -name '.gitkeep' -delete 2>/dev/null || true
mkdir -p "$ROOT/backend/uploads"
echo "{}" > "$ROOT/backend/uploads/file-map.json"

echo "[5/5] Done."
echo ""
echo "✅ DocuChain is fresh. Start the backend (npm run dev in backend/), then"
echo "   optionally load the sample Board of Trustees documents:"
echo "   node scripts/seed-bot-documents.js"
