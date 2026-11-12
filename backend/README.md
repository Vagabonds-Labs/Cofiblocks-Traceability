# Backend — CofiBlocks Traceability

REST API built with Express + Prisma/Postgres. It is the core of the system: it authenticates users, stores private data, builds and submits transactions to the `traceability` contract on Stellar, and receives what farmers record through the VoiceLedger bot.

> 🚧 **Status:** login, on-chain roles, farmer upload, notifications, the testnet faucet, the farmer-agent wallet and the VoiceLedger `farmer.linked` event work against the v1 contract on testnet. The rest of the VoiceLedger events and everything related to batches are under construction. See [What is missing](#what-is-missing).

## What it does

- **Signature-based login.** There are no passwords: the user signs a nonce with their wallet. It supports Stellar wallets (SEP-53) and Cavos wallets, which use their own prefix and sign with a "control key" that the backend checks on Horizon. Sessions use short-lived JWTs and refresh tokens in cookies. On every request the backend checks that the session is still active and reads the user's current permissions from the database, so logging out, revoking a session or removing admin rights takes effect immediately.
- **Roles.** The admin assigns a role and an organization to each person. The role is written to the contract first and to the database second, so the database never claims something the chain does not back.
- **Farmers.** Imports each cooperative's list from a CSV, with per-line validation and a dry-run mode (`dryRun`). Uploading the same file again does not create duplicates.
- **Stellar.** Builds, simulates and submits transactions. The backend's admin account pays everyone's fees with fee-bump, so no user needs XLM. Transactions from the same backend account are built and sent one at a time, so they do not race for the sequence number.
- **Wallets funded automatically (testnet).** Own wallets are created by Friendbot at first login. Cavos wallets are created by Cavos and then funded once by a dedicated faucet account (`POST /wallet/fund`), with an exactly-once guarantee that survives retries and restarts: a payment whose outcome is unknown stays pending until it is found on the network or the network proves it never landed (expired, and missing from an index that has caught up past its expiry).
- **Farmer agent.** Farmers have no wallet: a dedicated backend account signs every farmer action on chain, and the admin pays its fees with fee-bump.
- **VoiceLedger integration.** Receives the signed events from VoiceLedger's farmer bot (see [below](#voiceledger-integration)).
- **Notifications** in English, Spanish, Afaan Oromoo and Amharic (`locales/`).

## Layout

```
backend/
├── prisma/
│   ├── schema.prisma          # models (see below)
│   └── migrations/            # applied with `prisma migrate deploy`; need a new database
├── scripts/
│   ├── seed.ts                # union, 3 cooperatives and their 11 collection centers
│   └── grant-admin.ts         # grants admin rights to an address
├── locales/                   # notification texts (en, es, om, am)
└── src/
    ├── index.ts               # Express app and routes
    ├── routes/                # endpoints
    ├── schemas/               # input validation with zod
    ├── services/
    │   ├── app/               # logic: auth, users, farmers, organizations, notifications, integrations
    │   ├── db/                # database access
    │   ├── onchain/           # Stellar accounts, faucet and traceability contract calls
    │   └── storage/           # files in Supabase Storage
    ├── lib/StellarContracts/  # Soroban client: TxBuilder, TxSubmitter, events, addresses
    ├── middleware/            # authentication, roles, logging, errors
    └── bot/                   # our own Telegram bot (no longer used, see below)
```

**Main models:**

| Model | What it stores |
|---|---|
| `User` | Staff who sign in to the web app: wallet, provider (Cavos or own wallet), role, organization, center. |
| `Organization`, `CollectionCenter` | The union, the cooperatives and their collection centers, with the numeric ID the contract uses. |
| `Farmer` | Farmer: cooperative ID, personal data, status (`PRELOADED` → `LINKED` → `REGISTERED` → `CONSENTED`) and on-chain transactions. |
| `AuthNonce`, `RefreshToken`, `Session` | Login and sessions. |
| `IntegrationEvent` | Every event received from VoiceLedger, with the answer returned, so retries get the same answer. |
| `Notification` | Notices for web app users. |

## Getting started

Requirements: Node.js 20+ and a **new** Postgres database. The initial migration is not compatible with the marketplace database.

The shared database is on **Supabase**. Supabase also exposes the `public` schema through its REST Data API with the public `anon` key; the `lock_down_public_schema` migration turns RLS on for every table and removes the table privileges of `anon` and `authenticated`, also for tables created later. Only the backend, connecting as the table owner, can read or write. Any new table should still get `ENABLE ROW LEVEL SECURITY` in its migration.

For a local database, a Docker container with a named volume survives restarts (the URL in `.env` is then `postgresql://postgres@127.0.0.1:55432/traceability`):

```bash
docker run -d --name cofiblocks-traceability-db --restart unless-stopped \
  -p 127.0.0.1:55432:5432 -v cofiblocks-traceability-pgdata:/var/lib/postgresql/data \
  -e POSTGRES_DB=traceability -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine
```

```bash
npm install
cp .env.example .env         # generate the JWT secrets with: openssl rand -hex 32
npx prisma migrate deploy    # creates the tables
npm run db:seed              # union, cooperatives and centers
npm run dev                  # http://localhost:4000
```

The first admin is granted from the console, after that person has signed in to the web app once:

```bash
npm run admin:grant -- G…
```

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | Postgres. With Supabase, the first is the transaction pooler (port 6543, with `?pgbouncer=true`) and the second the session pooler or direct connection (port 5432), used for migrations. |
| `PORT`, `FRONTEND_URL`, `BACKEND_URL` | URLs. If the web app and the API are on different domains, cookies are issued as cross-domain. |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_*_EXPIRY` | Sessions. Required: the backend refuses to start if a secret is missing, shorter than 32 characters, still the example value, or equal to the other one. `JWT_ACCESS_SECRET` must match the web app's `JWT_SECRET`. |
| `STELLAR_NETWORK` | `testnet` (default) or `mainnet`. |
| `STELLAR_ADMIN_SECRET` | Secret key of the contract's admin account, which also pays the fees. Get it with `stellar keys show cofi-admin`. |
| `STELLAR_FARMER_AGENT_SECRET` | Secret key of the farmer agent (`stellar keys show cofi-farmer-agent`). |
| `STELLAR_FAUCET_SECRET`, `FAUCET_AMOUNT_XLM` | Testnet faucet account (`stellar keys show cofi-faucet`) and the XLM sent to each staff wallet (default 10). |
| `VOICELEDGER_WEBHOOK_SECRET` | Shared secret for VoiceLedger's HMAC signatures. Empty = the integration answers 503. |
| `STELLAR_RPC_URL`, `STELLAR_HORIZON_URL` | Optional. Defaults to the network's public endpoints. |
| `STELLAR_TRACEABILITY_ADDRESS` | Optional. Overrides the contract address in `src/lib/StellarContracts/deployments.ts`. |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_STORAGE_BUCKET` | Files (receipts, photos, documents). |
| `TELEGRAM_*` | Only for our own bot, which is no longer used. |

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Server with auto-reload. |
| `npm run build` / `npm start` | Compiles to `dist/` and runs it. There is also a `dockerfile`. |
| `npm run prisma:migrate` | Creates a new migration in development. |
| `npm run prisma:studio` | Database browser. |
| `npm run db:seed` | Loads organizations and centers. Safe to run more than once. |
| `npm run admin:grant -- G…` | Grants admin rights. |
| `npm run chain:sync-roles` | Writes the roles stored in the database to the current contract (after a redeploy). |
| `npm run voiceledger:send -- <type> '<data>'` | Sends a signed event exactly as VoiceLedger's bot would (testing and demos). |

## Endpoints

All under `/api`.

| Method and route | Who | What it does |
|---|---|---|
| `POST /auth/nonce` | anyone | Requests the message to sign. |
| `POST /auth/register_wallet` | anyone | Verifies the signature and starts a session. If the user has their own wallet and its Stellar account does not exist, Friendbot creates it (testnet only; the backend does not spend its own balance). |
| `POST /auth/refresh` | session | Renews the access token. |
| `POST /auth/logout` | session | Closes the session of the access token used. |
| `GET /auth/me` | session | Current user with their role, organization and center. |
| `GET /auth/sessions`, `DELETE /auth/sessions[/:sessionId]` | session | Open sessions. A user can only revoke their own. |
| `GET /organizations` | session | Cooperatives and union, with their collection centers. |
| `GET /users`, `DELETE /users/:userId` | admin | Users, filterable by role and organization. |
| `PATCH /users` | session | Edits the user's own profile (name, email). |
| `PATCH /users/:userId/admin` | admin | Grants or removes admin rights. |
| `PUT /admin/users/:userId/role` | admin | Assigns a role: writes it to the contract, then to the database. |
| `DELETE /admin/users/:userId/role` | admin | Removes the role from the contract and the database. |
| `GET /admin/farmers` | admin | Farmers with filters and counts per status. |
| `POST /admin/farmers/import` | admin | Imports a cooperative's list (CSV as text). |
| `GET /notifications?lang=` | session | The user's notifications in `en`, `es`, `om` or `am`. |
| `PATCH /notifications` | session | Marks notifications as read. |
| `POST /notifications` | admin | Creates a notification. |
| `GET /wallet` | session | The user's Stellar account: whether it exists, XLM balance and funding transaction. |
| `POST /wallet/fund` | session | Sends testnet XLM to the user's account, once. The account must exist (`409 ACCOUNT_NOT_DEPLOYED`). |
| `POST /integrations/voiceledger/events` | VoiceLedger (HMAC) | One event from the farmers' bot. |
| `GET /integrations/voiceledger/events/:eventId` | VoiceLedger (HMAC) | Status of an event. |
| `GET /config/stellar` | anyone | Network, passphrase, contract address and faucet address. |
| `GET /health` | anyone | Service status. |

## VoiceLedger integration

Farmers do not use the web app: they talk to a **Telegram voice bot built and run by VoiceLedger**. VoiceLedger turns what the farmer says into JSON and sends it to us. The full contract with VoiceLedger (headers, envelope, events, errors) is in [`docs/voiceledger-integration.md`](../docs/voiceledger-integration.md). The backend:

1. verifies the message's HMAC signature and timestamp, and discards duplicates by `event_id`;
2. validates the data, for example that the farmer's ID is on their cooperative's list or that the GPS point falls inside Gomma;
3. stores the full record off chain;
4. signs the on-chain action with the **farmer-agent wallet**, a backend account dedicated to that alone, because farmers have no wallet;
5. replies with the result and the transaction link, so the bot can show it to the farmer.

| Event | On-chain action (v1 contract) | Status |
|---|---|---|
| `farmer.linked` | `register_farmer` | Implemented |
| `farmer.consent` | `record_consent` (only for an acceptance with every declaration) | Implemented |
| `farmer.profile` | `set_profile`; every edit is a new version with its own hash | Implemented |
| `delivery.created` | `create_batch`; we generate the batch number `DD-MM-YYYY <farmer_ref>` (`/2`, `/3`… for more deliveries that day) | Implemented |

Retries with the same `event_id` get the stored answer and never write on chain twice; the same `event_id` with different content is rejected. Every farmer-agent write stores its transaction hash before sending it, so an interrupted write is reconciled with the network instead of being sent again (`src/services/onchain/ensureOnChain.ts`). The hashes on chain are SHA-256 of the canonical JSON of the off-chain record (`src/utils/canonicalJson.ts`), so anyone with the record can recompute them.

Pilot settings still being confirmed (consent texts, the fachasa → hectare factor, the pilot area for GPS checks) live in `src/config/pilot.ts`, with `FACHASA_TO_HECTARES` and `FARM_AREA_BBOX` as overrides.

**SOW evidence.** `npm run sow:evidence -- KK ID001 --out ../docs/sow-evidence.md` produces the three on-chain proofs of deliverable 2 on testnet and writes the table of transactions ([last run](../docs/sow-evidence.md)): a farmer creates a batch through the VoiceLedger API; a Collector records weight and receipt (`ReceptionService`: the backend prepares the transaction, the Collector's key signs it, the backend checks it is exactly the prepared call and sends it with fee-bump — the same path the web app will use with Cavos); and two unauthorized attempts sent without simulation, so the contract rejects them on chain (`#4 WRONG_ORGANIZATION`, `#13 RECEPTION_ALREADY_RECORDED`). It needs the backend running on the same database and creates two throwaway Collector accounts per run.

**Simulator.** With the backend running, `npm run voiceledger:demo -- KK ID001` runs a farmer's whole journey (link → consent → profile → delivery → retry) through the signed API and prints the Stellar Expert link of each step. `npm run voiceledger:send` sends a single event. The OpenAPI description is [`docs/voiceledger-openapi.yaml`](../docs/voiceledger-openapi.yaml). In the other direction, we will notify VoiceLedger (signed webhook) when the Collector records the weight or the batch changes stage; the format is being agreed with VoiceLedger.

**Our own bot (`src/bot/`)** is a week-0 prototype from before VoiceLedger took over the bot. It validates the farmer's ID against the list. It is no longer used: it stays off while `TELEGRAM_BOT_TOKEN` is empty.

## What is missing

By sprint week (details in the [plan](../docs/implementation-plan.md)):

- **Staging** (postponed): deploy and the cross-domain cookie setup (review finding R6).
- **Week 3:** endpoints for reception (weight and receipt), stage changes, documents, batch history and CSV export; notifications to VoiceLedger.
- **Week 4:** permission tests for every role against every endpoint, in CI.
