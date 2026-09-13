# DocuChain
**A Blockchain-Based Enterprise Document Organization and Integrity Verification System**

Davao del Norte State College — Institute of Computing

---

## Tech Stack

| Layer | Technology |
|---|---|
| Blockchain | Hyperledger Fabric 2.5 (permissioned, LAN) |
| Chaincode | Node.js (Fabric Contract API) |
| Backend API | Node.js + Express |
| Database | PostgreSQL |
| Full-Text Search | MeiliSearch |
| Frontend | React + Vite + Tailwind CSS |
| File Storage | Local filesystem (LAN server) |
| Hashing | Node.js `crypto` (MD5, SHA-1, SHA-256) |

---

## Prerequisites

Install these on your physical LAN server (and dev machine):

```bash
# 1. Docker & Docker Compose
https://docs.docker.com/get-docker/

# 2. Node.js v18+
https://nodejs.org/

# 3. Git
https://git-scm.com/

# 4. Hyperledger Fabric binaries + Docker images
curl -sSL https://bit.ly/2ysbOFE | bash -s -- 2.5.0 1.5.7
# This downloads: fabric-samples/, bin/, and pulls HLF Docker images
```

---

## Project Structure

```
docuchain/
├── fabric-network/              # Hyperledger Fabric network
│   ├── config/
│   │   ├── configtx.yaml        # Channel & org config
│   │   └── crypto-config.yaml   # MSP / cert generation
│   ├── scripts/
│   │   ├── network-up.sh        # Start HLF network
│   │   ├── network-down.sh      # Tear down network
│   │   └── deploy-chaincode.sh  # Package & deploy chaincode
│   └── docker-compose-fabric.yml
│
├── chaincode/
│   └── document/                # Smart contract (Node.js)
│       ├── index.js             # Chaincode entry point
│       ├── documentContract.js  # Contract logic
│       └── package.json
│
├── backend/                     # Express REST API
│   ├── src/
│   │   ├── app.js               # App entry point
│   │   ├── config/
│   │   │   ├── database.js      # PostgreSQL connection
│   │   │   └── fabric.js        # HLF gateway config
│   │   ├── routes/
│   │   │   ├── documents.js     # Upload, retrieve, verify
│   │   │   ├── search.js        # Full-text search
│   │   │   └── audit.js         # Audit trail
│   │   ├── services/
│   │   │   ├── blockchainService.js  # HLF submit/query
│   │   │   ├── hashingService.js     # MD5, SHA-1, SHA-256
│   │   │   ├── searchService.js      # MeiliSearch integration
│   │   │   └── storageService.js     # File system ops
│   │   ├── middleware/
│   │   │   ├── auth.js          # JWT authentication
│   │   │   └── upload.js        # Multer file handling
│   │   └── models/
│   │       ├── Document.js      # Document schema
│   │       └── User.js          # User schema
│   ├── .env.example
│   └── package.json
│
├── frontend/                    # React + Vite
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Upload.jsx
│   │   │   ├── Verify.jsx
│   │   │   ├── Search.jsx
│   │   │   └── AuditTrail.jsx
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Navbar.jsx
│   │   │   │   └── Sidebar.jsx
│   │   │   └── ui/
│   │   │       ├── HashBadge.jsx
│   │   │       ├── IntegrityStatus.jsx
│   │   │       └── DocumentCard.jsx
│   │   ├── services/
│   │   │   └── api.js           # Axios API client
│   │   └── hooks/
│   │       └── useDocuments.js
│   ├── vite.config.js
│   └── package.json
│
├── uploads/                     # Document storage (LAN server)
├── docker-compose.yml           # PostgreSQL + MeiliSearch
├── .vscode/
│   ├── extensions.json          # Recommended VS Code extensions
│   └── settings.json
└── README.md
```

---

## Setup Guide

### Step 1 — Clone & install dependencies

```bash
git clone <your-repo> docuchain
cd docuchain

# Backend
cd backend && npm install && cd ..

# Frontend
cd frontend && npm install && cd ..

# Chaincode
cd chaincode/document && npm install && cd ../..
```

### Step 2 — Start supporting services (Postgres + MeiliSearch)

```bash
docker-compose up -d
```

### Step 3 — Start Hyperledger Fabric network

```bash
cd fabric-network
chmod +x scripts/*.sh
./scripts/network-up.sh
```

### Step 4 — Deploy the chaincode

```bash
./scripts/deploy-chaincode.sh
```

### Step 5 — Configure backend environment

```bash
cd backend
cp .env.example .env
# Edit .env with your values
```

### Step 6 — Run the backend

```bash
cd backend
npm run dev
```

### Step 7 — Run the frontend

```bash
cd frontend
npm run dev
```

Frontend → http://localhost:5173  
Backend API → http://localhost:3000  
MeiliSearch → http://localhost:7700  

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/documents/upload` | Upload & hash document |
| GET | `/api/documents` | List all documents |
| GET | `/api/documents/:id` | Get document details |
| POST | `/api/documents/:id/verify` | Verify document integrity |
| GET | `/api/search?q=keyword` | Full-text content search |
| GET | `/api/audit` | Audit trail log |
| POST | `/api/auth/login` | User login |

---

## Hashing Strategy

DocuChain computes **three hash values** per document on upload:

| Algorithm | Purpose |
|---|---|
| MD5 | Fast checksum (legacy compatibility) |
| SHA-1 | Intermediate verification layer |
| SHA-256 | Primary integrity proof (stored on blockchain) |

All three are recorded on the blockchain ledger. Tamper detection compares live hash against ledger record.
