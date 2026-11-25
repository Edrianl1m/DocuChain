#!/bin/bash
# DocuChain — back up everything needed to restore the server:
# Postgres dump, stored files, file map, Fabric identities and ledger, .env.
#   sudo bash deploy/backup.sh            -> backups/docuchain-<date>.tar.gz
# Copy the archive off the server (e.g. scp) — it contains secrets.
set -e
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
WORK="$(mktemp -d)"
mkdir -p backups

docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U docuchain_user docuchain > "$WORK/postgres.sql"

# Named volumes (files, file map, ledger) copied through a throwaway container
for vol in docuchain_uploads_data docuchain_filemap_data fabric-network_peer0_data fabric-network_orderer_data; do
  docker run --rm -v "$vol":/v:ro -v "$WORK":/out alpine tar czf "/out/$vol.tar.gz" -C /v .
done

cp -r fabric-network/crypto-config fabric-network/channel-artifacts .env "$WORK/"
tar czf "backups/docuchain-$STAMP.tar.gz" -C "$WORK" .
rm -rf "$WORK"
chmod 600 "backups/docuchain-$STAMP.tar.gz"
echo "Backup written to backups/docuchain-$STAMP.tar.gz"
