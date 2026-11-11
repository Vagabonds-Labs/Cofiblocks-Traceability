# CofiBlocks Traceability

> 🚧 **Under construction.** This project is in active development: some parts already run on Stellar Testnet and others are still a plan. None of it is ready for production or real data.

Coffee traceability from the farm to export, verifiable on [Stellar](https://stellar.org). The first pilot runs with coffee cooperatives in the Jimma zone (Gomma woreda), Ethiopia.

---

## Why we are building it

Smallholder coffee changes hands many times before it is exported: the farmer delivers it to a collection center, the cooperative washes, ferments, dries and stores it, and the union prepares and sells it. Today that journey is recorded mostly on paper, and it is hard to prove where each batch comes from.

That proof is no longer optional. The **EU Deforestation Regulation (EUDR)** requires coffee entering Europe to be traceable to the plot where it was grown, with proof that no deforestation happened after December 31, 2020. If cooperatives cannot show it, they lose access to one of their main markets.

With CofiBlocks Traceability we want to:

- **Give every batch a verifiable history:** who delivered it, how much it weighed, which stages it went through and who made each change, with the proof on a public blockchain that nobody can rewrite.
- **Protect farmers:** their names, phone numbers and locations never go on chain. On chain there are only pseudonymous IDs and fingerprints (hashes) of the records.
- **Work for the people who use it:** farmers use Telegram, with voice and in their own language, with no wallets or passwords. Cooperative staff use a simple web app and sign in with their email.
- **Give cooperatives a tool of their own** to produce the reports the EUDR requires, instead of depending on intermediaries.

CofiBlocks started as a coffee marketplace in Costa Rica. This repository is the traceability module, tested first in Ethiopia and later adapted to Costa Rica.

## How it works

```
Farmer ── Telegram + voice ──► VoiceLedger bot ── JSON ──► Backend ──► farmer-agent wallet ──┐
                                                             ▲                                │
Cooperative and union staff ── Web app ── signs ─────────────┘                                ▼
                                                                    traceability contract (Stellar)
                                                             │
                                                             └──► Postgres + Supabase Storage (private data)
```

**Who takes part:**

| Actor | Channel | What they do |
|---|---|---|
| Farmer | Telegram bot with voice, built by [VoiceLedger](#partners) | Registers with the ID their cooperative gave them, signs the EUDR consent, adds their farm and records each delivery. |
| Coffee Collector (collection center) | Web app | Records the weight and receipt of each delivery. |
| Industry Manager and Store Keeper | Web app | Move the batch through washing, fermentation, drying, storage and transport to the union. |
| Export Manager (union) | Web app | Records quality, export preparation and the sale. Produces reports. |
| Admin | Web app | Assigns roles and uploads each cooperative's farmer list. |

**Batch stages:** Delivered → Received (weight and receipt) → Washing → Fermentation → Drying → Storage → In transport to the union → Prepared with exportable bag → Sold.

**What goes on chain and what does not:**

- **On chain:** the farmer's pseudonymous ID (for example `KK-ID001`), the batch number, the stage, who made each change and when, the weight, and the hash of every record and document.
- **Off chain:** names, phone numbers, GPS locations, photos and documents. They live in Postgres and Supabase Storage.

The backend recomputes the hash of each record and compares it with the one on Stellar, so anyone can check that the data was not altered.

**Frictionless wallets:**

- Staff sign in with their email through [Cavos](https://cavos.xyz), which creates an invisible Stellar wallet for them: no seed phrases or browser extensions. People who already have a Stellar wallet (Freighter, xBull, Lobstr…) can use it too.
- Farmers have no wallet, because a wallet cannot be embedded in Telegram. Their actions are signed by a backend wallet dedicated to that alone, and on chain they are identified by their pseudonymous ID.
- Nobody needs XLM: the backend pays the network fees (fee-bump).

## Plan and status

The current work is a 4-week sprint funded by a **Stellar Instaward** (November 16 to December 15, 2026). It has three deliverables:

1. **Frictionless login and invisible wallets:** email through Cavos, with wallets funded automatically with testnet XLM.
2. **Role-based smart contracts:** the farmer's delivery and the collector's weight are immutable; after that a batch can only move to the next stage or get documents attached. The contract rejects any unauthorized action.
3. **Web interface:** each role performs its actions, views the batch history, uploads documents and exports CSV.

| Week | Focus | Status |
|---|---|---|
| 0 (Nov 9–13) | Repo base, v0 contract on testnet, Cavos login, roles and farmer upload, languages | ✅ Nearly done |
| 1 (Nov 16–20) | Invisible wallets with a faucet, farmer-agent wallet, VoiceLedger integration, staging | 🟡 Code done and tested on testnet; staging and the Cavos check in a real browser pending |
| 2 (Nov 23–27) | v1 contract with every permission and its tests, farmer deliveries and profile | 🟡 v1 contract deployed early (29 tests); deliveries and profile pending |
| 3 (Nov 30 – Dec 4) | Web app for the full flow: weight, stages, documents, history and CSV | ⏳ |
| 4 (Dec 7–11) | End-to-end tests, CI tests, demo and documentation | ⏳ |

The details (design, decisions, open questions and risks) are in [`docs/implementation-plan.md`](docs/implementation-plan.md).

**After the sprint:** the pilot with about 200 farmers from 3 cooperatives, EUDR reports in GeoJSON, polygons for large farms, daily prices per cooperative, a KPI dashboard and a public batch page with a QR code.

**Languages:** English, Spanish, Afaan Oromoo and Amharic. The Oromo and Amharic translations are a first draft and need review by a native speaker.

## Repository layout

| Folder | Contents | Details |
|---|---|---|
| [`contracts/`](contracts/) | `traceability` contract in Rust for Soroban (Stellar) | [README](contracts/README.md) |
| [`backend/`](backend/) | Express + Prisma/Postgres API. Login, roles, farmers, Stellar transactions and the VoiceLedger integration | [README](backend/README.md) |
| [`webapp/`](webapp/) | Next.js web app for cooperative and union staff | [README](webapp/README.md) |
| [`scripts/`](scripts/) | Stellar Testnet environment setup | `setup-testnet.sh` |
| [`docs/`](docs/) | Implementation plan, VoiceLedger integration contract, reviews and design notes | [Plan](docs/implementation-plan.md) · [VoiceLedger](docs/voiceledger-integration.md) |

## Running it locally

Requirements: Node.js 20+, Postgres (local or Supabase), Rust with the `wasm32v1-none` target and the [Stellar CLI](https://developers.stellar.org/docs/tools/cli).

1. **Backend identities on testnet** (admin, farmer agent, faucet), funded with Friendbot:

   ```bash
   ./scripts/setup-testnet.sh
   ```

2. **Contract.** One is already deployed on testnet. To deploy your own, see [contracts/README.md](contracts/README.md).
3. **Backend** at `http://localhost:4000`. See [backend/README.md](backend/README.md).
4. **Web app** at `http://localhost:3000`. See [webapp/README.md](webapp/README.md).

Contract deployed on testnet (v1): [`CC4ZL3I3…TW524`](https://stellar.expert/explorer/testnet/contract/CC4ZL3I3IDG5BNBBH4XRRM2CWG6VZHJEND2SAHLCY7ISMUEWIG5TW524).

## Partners

- **[Stellar Community Fund — Instawards](https://communityfund.stellar.org):** funds the current sprint.
- **Welthungerhilfe (WHH):** supports the pilot in Ethiopia.
- **VoiceLedger:** builds the Telegram voice bot for farmers and sends us their structured data.
- **Cavos:** invisible wallets and login with email and Telegram.

## License

No license has been chosen yet. One will be added before the sprint closes, together with the open-source documentation.
