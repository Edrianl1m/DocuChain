#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# DocuChain — Package & Deploy Chaincode to Fabric Network
# ─────────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FABRIC_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$FABRIC_DIR")"
CHAINCODE_DIR="$ROOT_DIR/chaincode/document"
FABRIC_BIN="$HOME/fabric-samples/bin"

export PATH="$FABRIC_BIN:$PATH"
export FABRIC_CFG_PATH="$HOME/Downloads/capstone/docuchain/fabric-samples/config"

CHANNEL_NAME="docuchain"
CHAINCODE_NAME="docuchain-cc"
CHAINCODE_VERSION="1.0"
CHAINCODE_SEQUENCE=1
ORDERER_CA="$FABRIC_DIR/crypto-config/ordererOrganizations/docuchain.local/orderers/orderer.docuchain.local/msp/tlscacerts/tlsca.docuchain.local-cert.pem"
PEER_TLS_ROOTCERT="$FABRIC_DIR/crypto-config/peerOrganizations/org1.docuchain.local/peers/peer0.org1.docuchain.local/tls/ca.crt"

export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE="$PEER_TLS_ROOTCERT"
export CORE_PEER_MSPCONFIGPATH="$FABRIC_DIR/crypto-config/peerOrganizations/org1.docuchain.local/users/Admin@org1.docuchain.local/msp"
export CORE_PEER_ADDRESS="peer0.org1.docuchain.local:7051"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   DocuChain — Chaincode Deployment       ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Step 1: Install node_modules ─────────────────────────────────
echo "[1/5] Installing chaincode dependencies..."
cd "$CHAINCODE_DIR"
npm install --production
echo "      ✓ Dependencies installed"

# ── Step 2: Package chaincode ────────────────────────────────────
echo "[2/5] Packaging chaincode..."
cd "$FABRIC_DIR"
peer lifecycle chaincode package "$CHAINCODE_NAME.tar.gz" \
  --path "$CHAINCODE_DIR" \
  --lang node \
  --label "${CHAINCODE_NAME}_${CHAINCODE_VERSION}"
echo "      ✓ Chaincode packaged: $CHAINCODE_NAME.tar.gz"

# ── Step 3: Install on peer ──────────────────────────────────────
echo "[3/5] Installing chaincode on peer..."
peer lifecycle chaincode install "$CHAINCODE_NAME.tar.gz"
echo "      ✓ Chaincode installed"

# ── Step 4: Get package ID ───────────────────────────────────────
PACKAGE_ID=$(peer lifecycle chaincode queryinstalled | grep "${CHAINCODE_NAME}_${CHAINCODE_VERSION}" | awk '{print $3}' | tr -d ',')
echo "      Package ID: $PACKAGE_ID"

# ── Step 5: Approve and commit ───────────────────────────────────
echo "[4/5] Approving chaincode definition..."
peer lifecycle chaincode approveformyorg \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.docuchain.local \
  --channelID "$CHANNEL_NAME" \
  --name "$CHAINCODE_NAME" \
  --version "$CHAINCODE_VERSION" \
  --package-id "$PACKAGE_ID" \
  --sequence "$CHAINCODE_SEQUENCE" \
  --tls \
  --cafile "$ORDERER_CA"
echo "      ✓ Chaincode approved"

echo "[5/5] Committing chaincode to channel..."
peer lifecycle chaincode commit \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.docuchain.local \
  --channelID "$CHANNEL_NAME" \
  --name "$CHAINCODE_NAME" \
  --version "$CHAINCODE_VERSION" \
  --sequence "$CHAINCODE_SEQUENCE" \
  --tls \
  --cafile "$ORDERER_CA" \
  --peerAddresses localhost:7051 \
  --tlsRootCertFiles "$PEER_TLS_ROOTCERT"
echo "      ✓ Chaincode committed"

echo ""
echo "══════════════════════════════════════════════"
echo " ✅  Chaincode '$CHAINCODE_NAME' deployed"
echo "     Channel  : $CHANNEL_NAME"
echo "     Version  : $CHAINCODE_VERSION"
echo "══════════════════════════════════════════════"
echo ""
