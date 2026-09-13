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
