#!/bin/bash
# DocuChain — Tear down Fabric network and clean up

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FABRIC_DIR="$(dirname "$SCRIPT_DIR")"

echo "Stopping DocuChain Fabric network..."

cd "$FABRIC_DIR"
if command -v docker-compose >/dev/null 2>&1; then
  docker-compose -f docker-compose-fabric.yml down --volumes --remove-orphans
else
  docker compose -f docker-compose-fabric.yml down --volumes --remove-orphans
fi

echo "Cleaning generated artifacts..."
rm -rf "$FABRIC_DIR/crypto-config"
rm -rf "$FABRIC_DIR/channel-artifacts"
rm -f "$FABRIC_DIR"/*.tar.gz

echo "✓ Network stopped and cleaned."
