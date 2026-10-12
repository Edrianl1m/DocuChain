# Repository guidance

## Project overview

DocuChain is a document management system for the DNSC Board of Trustees Records Office. It combines a React interface, an Express API, PostgreSQL, MeiliSearch, and a Hyperledger Fabric ledger for document integrity and audit history.

## Repository map

- `frontend/`: React 18 and Vite application using ES modules, Tailwind CSS, and React Router. Pages live in `src/pages/`, shared components in `src/components/`, and API calls in `src/services/api.js`.
- `backend/`: Node.js Express API using CommonJS. `src/app.js` starts the server; routes, middleware, models, configuration, and integration services have separate directories under `src/`.
- `chaincode/document/`: CommonJS Fabric smart contract. `documentContract.js` implements document transactions and `index.js` exports the contract.
- `fabric-network/`: Fabric configuration, Docker Compose file, and Bash scripts for network startup and chaincode deployment.
- `explorer/`: Hyperledger Explorer configuration and Compose file.
- `docker-compose.yml`: PostgreSQL and MeiliSearch services only; frontend, backend, and Fabric startup are separate.

## Setup and commands

There is no root npm package. Run commands in the appropriate package directory. Backend and chaincode declare Node.js >=18; use a supported Node.js version compatible with the dependencies.

| Directory | Command | Purpose |
| --- | --- | --- |
| `backend/`, `frontend/`, `chaincode/document/` | `npm ci` | Install dependencies from the package lockfile |
| `backend/` | `npm run dev` | Start the API with nodemon |
| `backend/` | `npm start` | Start the API with Node.js |
| `frontend/` | `npm run dev` | Start the Vite development server |
| `frontend/` | `npm run build` | Build the frontend |
| `frontend/` | `npm run preview` | Preview the built frontend |
| `backend/`, `chaincode/document/` | `npm run lint` | Invoke ESLint; see validation limitations below |

Copy `backend/.env.example` to `backend/.env` for local configuration and supply the necessary values. Do not overwrite an existing environment file. The backend initializes PostgreSQL and MeiliSearch before listening; its default port is 3000 and its health endpoint is `/api/health`.

Fabric scripts require Bash, Docker, and Fabric binaries. On Windows, use an appropriately configured Bash/WSL environment. Inspect script paths before running: `network-up.sh` currently expects binaries under `$HOME/fabric-samples/bin`. Network startup generates cryptographic material, so do not treat it as a routine validation command.

The root Compose file references `backend/src/config/init.sql`, which is absent from the current repository. Resolve that setup dependency before relying on database container initialization.

## Change conventions

- Follow the surrounding file's style. Frontend code generally omits semicolons; backend code generally uses semicolons and CommonJS imports. Avoid unrelated formatting changes.
- Reuse shared UI components and the existing frontend API client. Keep route payloads and API client calls consistent.
- Keep HTTP handling in routes and integration logic in services. Inspect the actual authentication and model imports before changing user persistence; a separate in-memory `usersStore.js` also exists.
- Coordinate contract transaction names, argument order, and ledger record shapes with backend blockchain calls. Preserve compatibility with existing document records or explain a migration requirement.
- Preserve authorization, document classification, hash verification, and audit history when changing document flows. Validate access on the server rather than relying on UI controls.
- Keep Fabric transaction logic deterministic across endorsing peers; use transaction-provided timestamps when adding timestamp behavior.
- Update the relevant package lockfile when changing dependencies and update setup documentation when behavior or configuration changes.
- Never commit `.env` files, secrets, uploaded documents, generated Fabric keys or channel artifacts, `node_modules/`, or build output. Follow `.gitignore`.

## Validation and delivery

- No package currently defines a test script. Do not claim that an automated test suite passed.
- For frontend changes, run `npm run build` in `frontend/` after dependencies are available. Check affected screens in a browser when practical.
- Backend and chaincode expose lint scripts, but no ESLint configuration is currently tracked. Report configuration blockers accurately; do not describe lint as passing without running it successfully.
- For backend or contract changes, run applicable syntax checks and focused behavior checks. Integration checks require the corresponding database, search, and Fabric services; a frontend build or syntax check does not validate those integrations.
- Documentation-only changes need a review of paths, commands, and the diff rather than application startup.
- Keep changes scoped to the requested task, preserve existing user changes, and report what changed, what was verified, and any remaining blockers.
