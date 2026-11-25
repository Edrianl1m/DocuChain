# DocuChain

A blockchain-based document management system built for the DNSC Board of Trustees (BOT) Records Office. DocuChain combines Hyperledger Fabric's immutable ledger with a modern web stack to give the Records Office secure document storage, role-based access, full-text search, and a verifiable audit trail — while automatically broadcasting public documents to the office's Facebook Page.

## About

The BOT Records Office needed a way to manage official documents that is both secure and transparent. DocuChain addresses this by anchoring document metadata and hashes on a permissioned Hyperledger Fabric blockchain, so every action — upload, access, or update — is tamper-evident and auditable. Documents are classified as **public** or **confidential**, keeping the system's transparency goals aligned with the reality that not everything can be blanket-encrypted on a blockchain.

## Features

- **Role-Based Access Control (RBAC)** — different permission levels for Records Office staff and other users
- **Blockchain-backed audit trail** — every document action is recorded immutably on Hyperledger Fabric
- **Full-text search** — powered by MeiliSearch for fast, relevant document lookup
- **Public/Confidential classification** — public documents are eligible for automatic broadcasting; confidential ones stay restricted
- **Facebook Page integration** — public documents are auto-posted via the Facebook Graph API
- **File upload & download** — secure document handling with hash verification
- **PostgreSQL-backed authentication** — standard, reliable user auth alongside the blockchain layer

## Tech Stack

| Layer | Technology |
|---|---|
| Blockchain | Hyperledger Fabric 2.x |
| Backend | Node.js, Express |
| Frontend | React, Vite |
| Database | PostgreSQL (Sequelize ORM) |
| Search | MeiliSearch |
| Deployment | LAN-only, physical server (DNSC) |

## Project Structure

```
docuchain/
├── backend/            # Express API, auth, services (blockchain, search, storage)
├── frontend/           # React + Vite client
├── chaincode/          # Hyperledger Fabric smart contracts
├── fabric-network/     # Network config, scripts, and channel setup
├── explorer/           # Hyperledger Explorer configuration
├── docker-compose.yml  # Container orchestration
└── README.md
```

## Getting Started

### Prerequisites

- Node.js (LTS recommended)
- Docker & Docker Compose
- PostgreSQL
- Hyperledger Fabric prerequisites (Docker images, `fabric-samples` binaries)

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/Edrianl1m/DocuChain.git
   cd DocuChain
   ```

2. **Set up environment variables**
   ```bash
   cp backend/.env.example backend/.env
   ```
   Fill in your database credentials and other required values.

3. **Install dependencies**
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   cd ../chaincode/document && npm install
   ```

4. **Bring up the Fabric network**
   ```bash
   cd fabric-network/scripts
   ./network-up.sh
   ./deploy-chaincode.sh
   ```

5. **Start the backend and frontend**
   ```bash
   # In backend/
   npm start

   # In frontend/
   npm run dev
   ```

> **Note:** `fabric-network/crypto-config/` and `uploads/` are gitignored, as they contain generated cryptographic material and uploaded documents respectively. These are generated locally when the network is brought up.

## Team

Capstone project developed by students of the Institute of Computing, Davao del Norte State College (DNSC).

## License

This project is developed as part of an academic capstone requirement at DNSC.

## Blockchain Explorer

Staff can open **Explorer** in the sidebar (`/explorer`) to browse the Fabric channel's blocks, newest first: block number, timestamp, action (REGISTER, VERIFY, UPDATE, DEACTIVATE), document SHA-256, previous hash and user. Click a block for its header hashes and transactions. **Validate Chain** recomputes every block hash and data hash and checks that each block points at the one before it.

The explorer reads the ledger through the `qscc` system chaincode (read-only), using the same `.env` Fabric settings as the rest of the API. If the network is down the page shows "Blockchain network offline" instead of failing. Optional settings: `FABRIC_CONNECT_TIMEOUT_MS` (default 4000) and `EXPLORER_MAX_VALIDATE_BLOCKS` (default 5000).

## Public Resolutions page

`/public` is a public page with no login: search by title, resolution number or year, newest first, with a first-page PDF preview, a "Verified on blockchain" badge (block, transaction and shortened SHA-256), and View, Download and Verify buttons. `/public/verify` lets anyone check a copy against the ledger.

- Upload has a **Publish on public page** switch (off by default) plus optional resolution number, date, title and summary.
- The **Public Page** screen in the sidebar (`/publishing`) publishes, hides or edits existing documents.
- Documents marked **Confidential** can never be published, listed, downloaded or verified publicly; the API enforces this.
- Public views, downloads and verifications are recorded in the `public_access_logs` table (Audit Trail → Public access) and never submit ledger transactions. Public verification only evaluates `GetDocument`.
- Publication settings live in the PostgreSQL table `document_publications`; Sequelize creates both tables on startup.


## Starting Fabric on Windows

The scripts run in **Git Bash** (comes with Git for Windows) and use the Windows binaries in `fabric-samples/bin`. Docker Desktop must be running.

1. Once only: open Notepad as Administrator, open `C:\Windows\System32\drivers\etc\hosts` and add
   `127.0.0.1 peer0.org1.docuchain.local orderer.docuchain.local`
2. In Git Bash, from `fabric-network/`:
   ```bash
   ./scripts/network-down.sh      # fresh start: removes old containers, volumes and crypto
   ./scripts/network-up.sh        # crypto, orderer, peer, CA, channel "docuchain"
   ./scripts/deploy-chaincode.sh  # installs docuchain-cc
   ```
3. Restart the backend (`npm run dev` in `backend/`).

To restart an existing network later without wiping it, start the containers again with `docker compose -f docker-compose-fabric.yml up -d` instead of running the scripts.

The landing page `http://localhost:5173/` shows the public resolutions to visitors; signed-in staff land on their dashboard.

## Online deployment

To run DocuChain on a public domain (one Linux server with Docker and HTTPS), see [deploy/DEPLOY.md](deploy/DEPLOY.md).
