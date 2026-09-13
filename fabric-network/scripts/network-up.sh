#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# DocuChain — Start Hyperledger Fabric Network
# ─────────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FABRIC_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="$FABRIC_DIR/config"
FABRIC_BIN="$HOME/fabric-samples/bin"   # Adjust if installed elsewhere

export PATH="$FABRIC_BIN:$PATH"
export FABRIC_CFG_PATH="$CONFIG_DIR"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   DocuChain — Fabric Network Bootstrap   ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Step 1: Generate crypto material ─────────────────────────────
echo "[1/4] Generating crypto material..."
cd "$CONFIG_DIR"
cryptogen generate --config=./crypto-config.yaml --output="$FABRIC_DIR/crypto-config"
echo "      ✓ Crypto material generated"

# ── Step 2: Generate channel genesis block ────────────────────────
echo "[2/3] Generating channel genesis block..."
mkdir -p "$FABRIC_DIR/channel-artifacts"
configtxgen \
  -profile DocuChainGenesis \
  -channelID docuchain \
  -outputBlock "$FABRIC_DIR/channel-artifacts/docuchain.block"
echo "      ✓ Channel genesis block created"

# ── Step 3: Generate channel transaction ─────────────────────────
echo "[3/4] Generating channel config transaction..."
configtxgen \
  -profile DocuChainChannel \
  -outputCreateChannelTx "$FABRIC_DIR/channel-artifacts/docuchain-channel.tx" \
  -channelID docuchain
echo "      ✓ Channel transaction created"

# ── Step 4: Start Docker containers ──────────────────────────────
echo "[3/3] Starting Fabric Docker containers..."
cd "$FABRIC_DIR"
docker-compose -f docker-compose-fabric.yml up -d
echo "      ✓ Containers started"

echo ""
echo "Waiting for peers to be ready..."
sleep 5

# ── Join orderer to channel via Channel Participation API ─────────
echo ""
echo "[+] Joining orderer to channel: docuchain ..."

osnadmin channel join \
  --channelID docuchain \
  --config-block "$FABRIC_DIR/channel-artifacts/docuchain.block" \
  -o orderer.docuchain.local:7053 \
  --ca-file "$FABRIC_DIR/crypto-config/ordererOrganizations/docuchain.local/orderers/orderer.docuchain.local/tls/ca.crt" \
  --client-cert "$FABRIC_DIR/crypto-config/ordererOrganizations/docuchain.local/orderers/orderer.docuchain.local/tls/server.crt" \
  --client-key "$FABRIC_DIR/crypto-config/ordererOrganizations/docuchain.local/orderers/orderer.docuchain.local/tls/server.key"

echo "      ✓ Orderer joined channel"

# ── Join peer to channel ───────────────────────────────────────────
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE="$FABRIC_DIR/crypto-config/peerOrganizations/org1.docuchain.local/peers/peer0.org1.docuchain.local/tls/ca.crt"
export CORE_PEER_MSPCONFIGPATH="$FABRIC_DIR/crypto-config/peerOrganizations/org1.docuchain.local/users/Admin@org1.docuchain.local/msp"
export CORE_PEER_ADDRESS="peer0.org1.docuchain.local:7051"

peer channel join \
  -b "$FABRIC_DIR/channel-artifacts/docuchain.block"

echo "      ✓ Peer joined channel"
echo ""
echo "══════════════════════════════════════════════"
echo " ✅  DocuChain Fabric network is UP"
echo "     Orderer : localhost:7050"
echo "     Peer    : localhost:7051"
echo "     CA      : localhost:7054"
echo "══════════════════════════════════════════════"
echo ""
echo "Next: run ./scripts/deploy-chaincode.sh"
echo ""
