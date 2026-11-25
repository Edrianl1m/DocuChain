#!/bin/bash
# DocuChain — pull the latest code and rebuild the app (data is kept)
#   sudo bash deploy/update.sh
set -e
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
git pull --ff-only
docker compose -f fabric-network/docker-compose-fabric.yml -f deploy/fabric.prod.yml up -d
docker compose -f docker-compose.prod.yml up -d --build
docker image prune -f >/dev/null
echo "Updated."
