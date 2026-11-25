#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# DocuChain — one-time setup of a fresh Ubuntu 22.04/24.04 server
#
#   sudo bash deploy/setup-server.sh
#
# Run from the repository root. Safe to run again: steps that are already
# done are skipped, and an existing Fabric ledger is never regenerated.
#   1. Installs Docker, Node.js, firewall (SSH/80/443 only) and swap
#   2. Downloads the Linux Fabric binaries into fabric-samples/
#   3. Creates .env with random secrets (asks for domain, email, admin password)
#   4. Starts the Fabric network and deploys the chaincode (first run only)
#   5. Builds and starts Postgres, MeiliSearch, the API and Caddy (HTTPS)
# ─────────────────────────────────────────────────────────────────

set -e

FABRIC_VERSION="${FABRIC_VERSION:-2.5.10}"
FABRIC_CA_VERSION="${FABRIC_CA_VERSION:-1.5.12}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

step() { echo ""; echo "==> $*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root: sudo bash deploy/setup-server.sh"
  exit 1
fi

# ── 1. System packages ───────────────────────────────────────────
step "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git ufw openssl nodejs npm

if ! command -v docker >/dev/null 2>&1; then
  step "Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

step "Configuring firewall (SSH, HTTP, HTTPS only)"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

# Fabric + builds need headroom on a 4 GB server
if [ "$(swapon --show | wc -l)" -eq 0 ]; then
  step "Adding 2 GB swap"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# The Fabric scripts reach the containers by their TLS host names
for host in peer0.org1.docuchain.local orderer.docuchain.local; do
  grep -q " $host\$" /etc/hosts || echo "127.0.0.1 $host" >> /etc/hosts
done

# ── 2. Fabric binaries ───────────────────────────────────────────
if [ ! -x fabric-samples/bin/peer ]; then
  step "Downloading Hyperledger Fabric $FABRIC_VERSION binaries"
  mkdir -p fabric-samples
  (
    cd fabric-samples
    curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
    bash install-fabric.sh --fabric-version "$FABRIC_VERSION" --ca-version "$FABRIC_CA_VERSION" binary
  )
fi
# Image the peer uses to build and run the Node.js chaincode
docker pull -q hyperledger/fabric-nodeenv:2.5 >/dev/null

# ── 3. .env with secrets ─────────────────────────────────────────
if [ ! -f .env ]; then
  step "Creating .env"
  [ -n "$DOMAIN" ] || read -rp "Domain (e.g. docuchain.example.com): " DOMAIN
  [ -n "$ACME_EMAIL" ] || read -rp "Email for Let's Encrypt notices: " ACME_EMAIL
  until [ ${#ADMIN_PASSWORD} -ge 10 ] && [[ "$ADMIN_PASSWORD" != *"'"* ]]; do
    read -rsp "Password for the 'admin' account (10+ characters, no ' quote): " ADMIN_PASSWORD; echo
  done
  {
    echo "DOMAIN=$DOMAIN"
    echo "ACME_EMAIL=$ACME_EMAIL"
    echo "ADMIN_PASSWORD='$ADMIN_PASSWORD'"
    echo "JWT_SECRET=$(openssl rand -hex 32)"
    echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
    echo "MEILI_MASTER_KEY=$(openssl rand -hex 24)"
    echo "JWT_EXPIRES_IN=8h"
    echo "MAX_FILE_SIZE_MB=50"
    echo "MAX_REQUEST_MB=60"
  } > .env
  chmod 600 .env
  echo "    .env created (keep a private copy of it)"
fi
DOMAIN="$(grep '^DOMAIN=' .env | cut -d= -f2)"

# ── 4. Fabric network ────────────────────────────────────────────
export FABRIC_BIN="$ROOT_DIR/fabric-samples/bin"
export FABRIC_COMPOSE_OVERRIDE="$ROOT_DIR/deploy/fabric.prod.yml"
FABRIC_COMPOSE="docker compose -f fabric-network/docker-compose-fabric.yml -f deploy/fabric.prod.yml"

if docker volume inspect fabric-network_peer0_data >/dev/null 2>&1 && [ -d fabric-network/crypto-config ]; then
  step "Fabric network already set up, making sure it is running"
  $FABRIC_COMPOSE up -d
else
  step "Creating the Fabric network (first run)"
  bash fabric-network/scripts/network-up.sh
fi
if [ ! -f fabric-network/channel-artifacts/.chaincode-deployed ]; then
  step "Deploying the DocuChain chaincode"
  sleep 5
  bash fabric-network/scripts/deploy-chaincode.sh
  touch fabric-network/channel-artifacts/.chaincode-deployed
fi

# ── 5. Application ───────────────────────────────────────────────
step "Building and starting DocuChain"
docker compose -f docker-compose.prod.yml up -d --build

step "Waiting for the API"
for i in $(seq 1 30); do
  if docker compose -f docker-compose.prod.yml exec -T backend \
       node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "    API is up"
    break
  fi
  sleep 3
done

echo ""
echo "══════════════════════════════════════════════════════"
echo " DocuChain is running."
echo "   Site : https://$DOMAIN"
echo "   Login: admin / the password you entered"
echo " The HTTPS certificate is issued once DNS for $DOMAIN"
echo " points to this server (check: docker compose -f"
echo " docker-compose.prod.yml logs caddy)."
echo "══════════════════════════════════════════════════════"
