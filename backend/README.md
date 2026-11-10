# Backend — CofiBlocks Traceability

REST API built with Express + Prisma/Postgres. It is the core of the system: it authenticates users, stores private data, builds and submits transactions to the `traceability` contract on Stellar, and receives what farmers record through the VoiceLedger bot.

> 🚧 **Status:** login, on-chain roles, farmer upload and notifications work. The VoiceLedger integration, the farmer-agent wallet, the faucet and everything related to batches are under construction. See [What is missing](#what-is-missing).

## What it does

- **Signature-based login.** There are no passwords: the user signs a nonce with their wallet. It supports Stellar wallets (SEP-53) and Cavos wallets, which use their own prefix and sign with a "control key" that the backend checks on Horizon. Sessions use short-lived JWTs and refresh tokens in cookies. On every request the backend checks that the session is still active and reads the user's current permissions from the database, so logging out, revoking a session or removing admin rights takes effect immediately.
- **Roles.** The admin assigns a role and an organization to each person. The role is written to the contract first and to the database second, so the database never claims something the chain does not back.
- **Farmers.** Imports each cooperative's list from a CSV, with per-line validation and a dry-run mode (`dryRun`). Uploading the same file again does not create duplicates.
- **Stellar.** Builds, simulates and submits transactions. The backend's admin account pays everyone's fees with fee-bump, so no user needs XLM.
- **Notifications** in English, Spanish, Afaan Oromoo and Amharic (`locales/`).

## Layout

```
backend/
├── prisma/
│   ├── schema.prisma          # models (see below)
│   └── migrations/            # a single initial migration: needs a new database
├── scripts/
│   ├── seed.ts                # union, 3 cooperatives and their 11 collection centers
│   └── grant-admin.ts         # grants admin rights to an address
├── locales/                   # notification texts (en, es, om, am)
└── src/
    ├── index.ts               # Express app and routes
    ├── routes/                # endpoints
    ├── schemas/               # input validation with zod
    ├── services/
    │   ├── app/               # logic: auth, users, farmers, organizations, notifications
    │   ├── db/                # database access
    │   ├── onchain/           # Stellar accounts and traceability contract calls
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
| `Notification` | Notices for web app users. |

## Getting started

Requirements: Node.js 20+ and a **new** Postgres database. The initial migration is not compatible with the marketplace database.

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
| `DATABASE_URL`, `DIRECT_URL` | Postgres. With Supabase, the first goes through the pooler and the second is the direct connection used for migrations. |
| `PORT`, `FRONTEND_URL`, `BACKEND_URL` | URLs. If the web app and the API are on different domains, cookies are issued as cross-domain. |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_*_EXPIRY` | Sessions. Required: the backend refuses to start if a secret is missing, shorter than 32 characters, still the example value, or equal to the other one. `JWT_ACCESS_SECRET` must match the web app's `JWT_SECRET`. |
| `STELLAR_NETWORK` | `testnet` (default) or `mainnet`. |
| `STELLAR_ADMIN_SECRET` | Secret key of the contract's admin account, which also pays the fees. Get it with `stellar keys show cofi-admin`. |
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
| `GET /config/stellar` | anyone | Network, passphrase and contract address. |
| `GET /health` | anyone | Service status. |

## VoiceLedger integration (in progress)

Farmers do not use the web app: they talk to a **Telegram voice bot built and run by VoiceLedger**. VoiceLedger turns what the farmer says into JSON and sends it to us. The backend:

1. verifies the message's HMAC signature and timestamp, and discards duplicates by `event_id`;
2. validates the data, for example that the farmer's ID is on their cooperative's list or that the GPS point falls inside Gomma;
3. stores the full record off chain;
4. signs the on-chain action with the **farmer-agent wallet**, a backend account dedicated to that alone, because farmers have no wallet;
5. replies with the result and the transaction link, so the bot can show it to the farmer.

| Event | On-chain action (v1 contract) |
|---|---|
| `farmer.linked` | `register_farmer` |
| `farmer.consent` | `record_consent` |
| `farmer.profile` | `set_profile` |
| `delivery.created` | `create_batch`; we generate the batch number `DD-MM-YYYY [FarmerID]` |

In the other direction, we notify VoiceLedger (signed webhook) when the Collector records the weight or the batch changes stage. The exact format is being agreed with VoiceLedger. The proposal is in [`docs/implementation-plan.md` §2.4](../docs/implementation-plan.md#24-voiceledger-integration-farmers).

**Our own bot (`src/bot/`)** is a week-0 prototype from before VoiceLedger took over the bot. It validates the farmer's ID against the list. It is no longer used: it stays off while `TELEGRAM_BOT_TOKEN` is empty.

## What is missing

By sprint week (details in the [plan](../docs/implementation-plan.md)):

- **Week 1:** testnet XLM faucet for new wallets (`POST /wallet/fund`), farmer-agent wallet, VoiceLedger integration endpoint, staging, and moving the database to Supabase.
- **Week 2:** v1 contract client and the `Batch`, `BatchEvent`, `Plot` and `Document` models; VoiceLedger events for consent, profile and deliveries; VoiceLedger simulator.
- **Week 3:** endpoints for reception (weight and receipt), stage changes, documents, batch history and CSV export; notifications to VoiceLedger.
- **Week 4:** permission tests for every role against every endpoint, in CI.
