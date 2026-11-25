#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# DocuChain — Rebuild the Fabric network + chaincode, using Docker only
#
# Same result as network-down.sh + network-up.sh + deploy-chaincode.sh,
# but every Fabric command runs inside the hyperledger/fabric-tools:2.5
# container. That avoids two Windows problems:
#   - cryptogen.exe writes "cacerts\..." (backslash) paths into msp/config.yaml
#   - orderer.docuchain.local / peer0.org1.docuchain.local don't resolve on
#     the host unless they are in the Windows hosts file
#
# Run in Git Bash from the docuchain folder with Docker Desktop running:
#   ./fabric-network/scripts/rebuild-network-docker.sh
# WARNING: starts a NEW, empty ledger (all on-chain documents are dropped).
# Restart the backend afterwards so it reloads the new certificates.
# ─────────────────────────────────────────────────────────────────
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FABRIC_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$FABRIC_DIR")"
export MSYS_NO_PATHCONV=1
TOOLS_IMAGE="hyperledger/fabric-tools:2.5"
NET="fabric-network_fabric-net"

# Windows-style path for docker -v when running under Git Bash
winpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }
FABRIC_MOUNT="$(winpath "$FABRIC_DIR"):/fabric"
CC_MOUNT="$(winpath "$ROOT_DIR/chaincode/document"):/cc:ro"

compose() { cd "$FABRIC_DIR"; if command -v docker-compose >/dev/null 2>&1; then docker-compose -f docker-compose-fabric.yml "$@"; else docker compose -f docker-compose-fabric.yml "$@"; fi; }

echo "[1/5] Removing the old network, volumes, crypto and artifacts..."
compose down --volumes --remove-orphans
rm -rf "$FABRIC_DIR/crypto-config" "$FABRIC_DIR/channel-artifacts" "$FABRIC_DIR"/*.tar.gz

echo "[2/5] Generating crypto material and the channel block (in Docker)..."
docker run --rm -v "$FABRIC_MOUNT" -w /fabric/config "$TOOLS_IMAGE" bash -c '
  set -e
  export FABRIC_CFG_PATH=/fabric/config
  cryptogen generate --config=./crypto-config.yaml --output=/fabric/crypto-config
  mkdir -p /fabric/channel-artifacts
  configtxgen -profile DocuChainGenesis -channelID docuchain -outputBlock /fabric/channel-artifacts/docuchain.block
'

echo "[3/5] Starting Fabric containers..."
compose up -d
sleep 8

echo "[4/5] Joining the channel and deploying chaincode docuchain-cc (in Docker, takes a few minutes)..."
docker run --rm --network "$NET" -v "$FABRIC_MOUNT" -v "$CC_MOUNT" "$TOOLS_IMAGE" bash -c '
  set -e
  F=/fabric
  OTLS=$F/crypto-config/ordererOrganizations/docuchain.local/orderers/orderer.docuchain.local/tls
  ORDERER_CA=$F/crypto-config/ordererOrganizations/docuchain.local/orderers/orderer.docuchain.local/msp/tlscacerts/tlsca.docuchain.local-cert.pem
  PEER_CA=$F/crypto-config/peerOrganizations/org1.docuchain.local/peers/peer0.org1.docuchain.local/tls/ca.crt
  export CORE_PEER_TLS_ENABLED=true CORE_PEER_LOCALMSPID=Org1MSP CORE_PEER_TLS_ROOTCERT_FILE=$PEER_CA
  export CORE_PEER_MSPCONFIGPATH=$F/crypto-config/peerOrganizations/org1.docuchain.local/users/Admin@org1.docuchain.local/msp
  export CORE_PEER_ADDRESS=peer0.org1.docuchain.local:7051
  osnadmin channel join --channelID docuchain --config-block $F/channel-artifacts/docuchain.block \
    -o orderer.docuchain.local:7053 --ca-file $OTLS/ca.crt --client-cert $OTLS/server.crt --client-key $OTLS/server.key
  sleep 5
  peer channel join -b $F/channel-artifacts/docuchain.block
  mkdir -p /tmp/cc && cp /cc/*.js /cc/package*.json /tmp/cc/
  cd /tmp
  peer lifecycle chaincode package docuchain-cc.tar.gz --path /tmp/cc --lang node --label docuchain-cc_1.0
  peer lifecycle chaincode install docuchain-cc.tar.gz
  PKG=$(peer lifecycle chaincode queryinstalled | grep "Label: docuchain-cc_1.0$" | tail -1 | awk "{print \$3}" | tr -d ",")
  peer lifecycle chaincode approveformyorg -o orderer.docuchain.local:7050 --channelID docuchain --name docuchain-cc \
    --version 1.0 --package-id "$PKG" --sequence 1 --tls --cafile $ORDERER_CA
  sleep 3
  peer lifecycle chaincode commit -o orderer.docuchain.local:7050 --channelID docuchain --name docuchain-cc \
    --version 1.0 --sequence 1 --tls --cafile $ORDERER_CA --peerAddresses peer0.org1.docuchain.local:7051 --tlsRootCertFiles $PEER_CA
  sleep 3
  peer lifecycle chaincode querycommitted --channelID docuchain --name docuchain-cc
' 2>&1 | grep -v "loadCertificateAt"

echo "[5/5] Done. Restart the backend so it picks up the new certificates."
