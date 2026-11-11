# Implementation plan — CofiBlocks Traceability (Ethiopia pilot)

**Committed scope:** the Instawards SOW submitted to Stellar on November 8, 2026 ("Instawards SOW – CofiBlocks Traceability", USD 5000, 30 days). If anything in this plan conflicts with the SOW, the SOW wins.
**Detailed reference:** Karla's document "CofiBlocks Traceability App Flow – Ethiopia Pilot" (Oct 28). It defines roles, stages and forms. Whatever the PDF asks for and the SOW does not cover goes to the [post-sprint backlog](#6-backlog-after-the-instaward).
**Sprint:** Monday, November 16 to Tuesday, December 15, 2026. That is 4 weeks of work plus 2 days of buffer to hand in the evidence. The week of November 9–13 is **week 0**, for preparation.
**Validation:** with test users (Karla, the WHH team and a few farmers and cooperative staff). **The pilot with the 200 farmers is out of the sprint** (SOW, "Out-of-Scope"): it happens after the initial tests.

**Decisions made:**

- **Two channels:**
  - **Farmers:** use only a **Telegram voice bot, built and run by VoiceLedger** (decided on November 10). VoiceLedger turns what the farmer says or types into **structured JSON and sends it to our API**. We do not build the bot.
  - **Cooperative and union staff:** use a **web app**. They sign in with **email through Cavos**, as the SOW requires. They can also sign in with Telegram through Cavos, or with their own Stellar wallet.
- **Farmers have no wallet.** A wallet cannot be embedded in Telegram, so **all their transactions are signed by a wallet in our backend**, the "farmer-agent wallet" (`farmer agent`), whenever a VoiceLedger message arrives.
  - On chain, the farmer is identified only by their pseudonymous `farmer_ref` (for example `KK-ID001`).
  - The farmer-agent wallet is separate from the admin wallet and can only perform farmer actions.
  - The Telegram Mini App with Cavos is dropped.
- **Staff sign their own transactions** with their invisible Cavos wallet. That wallet is **funded automatically with testnet XLM** from a faucet. The backend pays the fees with fee-bump, so the user never needs XLM.
- **SOW batch flow:**
  1. The farmer **records their delivery** through the VoiceLedger bot. That record is immutable.
  2. The Coffee Collector **adds the weight and the receipt**. These are immutable too.
  3. From then on, changes can only **advance the stage** or **attach documents**.
- **The farm profile and practices can be edited**, by the farmer themselves through the bot, as the SOW requires. This replaces the earlier decision that only staff could edit them.
- **GPS:** captured by the VoiceLedger bot ("Share location", typed or dictated coordinates) and sent to us in the JSON together with its source.
- The cooperative provides the **list of farmer IDs**. We check against it when VoiceLedger asks us to link someone.
- **Our part on the farmer side:** the API that receives VoiceLedger's JSON, its validation, the on-chain writes and the notifications back (see [§2.4](#24-voiceledger-integration-farmers)).

> **Alejandra Vargas (Ambassador Chapter Lead) needs to be told about a change from the SOW.** The SOW says every actor, farmers included, signs in with email and gets an invisible wallet. In practice, farmers use VoiceLedger's Telegram bot and our backend signs for them. The "A Farmer creates a batch" evidence will be a transaction signed by the farmer-agent wallet, with the `farmer_ref` in the event. It is best to tell her before handing in the evidence.

Each week ends with a **visual demo**, with real transactions on Stellar Testnet. The demo also covers what the SOW promises for that week.

---

## Status

**Week 0 (branch `semana-1-base`):**

- [x] Clean repo: no marketplace code in contracts, backend or web app.
- [x] `traceability` v0 contract with 20 tests, deployed on testnet:
  [`CAFZUGHO…KB32Z`](https://stellar.expert/explorer/testnet/contract/CAFZUGHOGCYW2ULV4ZN62T5EC7IPYZXTBKVCA3QUKO3QWJHQ5X6KB32Z). **It has to change** (see [§2.2](#22-traceability-contract-v1)): today the farmer has their own address and the Collector creates the batch.
- [x] New database (initial migration) and seed with the union, the 3 cooperatives and their 11 centers.
- [x] Admin: assign and remove roles (on chain), and import the farmer list from CSV.
- [x] Role-based home page.
- [x] Bot v0: language, cooperative and ID. Tested with simulated updates. **No longer used:** VoiceLedger builds the bot. The code stays in `backend/src/bot`; the ID check against the list is reused in the integration API.
- [x] Web app translations to Afaan Oromoo and Amharic (draft, pending review by a native speaker).
- [x] Cavos login (Telegram and email) instead of Privy, with Stellar wallet login still available. Tested with the real Cavos app (using its internal UUID as the App ID; the Telegram nonce bug still needs to be reported to them).
- [x] Security fixes from the [week 1 review](week-1-review.md): required JWT secrets, session revocation by owner, live permission checks, Friendbot-only account creation on testnet, and a working Docker image.

**Week 1 (done early, November 10):**

- [x] **v1 contract** (brought forward from week 2), with 29 tests including the 8 permission cases, deployed on testnet: [`CC4ZL3I3…TW524`](https://stellar.expert/explorer/testnet/contract/CC4ZL3I3IDG5BNBBH4XRRM2CWG6VZHJEND2SAHLCY7ISMUEWIG5TW524). `farmer_agent_set` points to `cofi-farmer-agent`; roles re-synced with `npm run chain:sync-roles`.
- [x] **Farmer-agent wallet** in the backend: signs farmer actions, the admin pays its fees with fee-bump.
- [x] **VoiceLedger integration:** `POST /api/integrations/voiceledger/events` with HMAC + timestamp, durable `event_id` idempotency and `farmer.linked` → `register_farmer` on chain. Contract proposal for VoiceLedger in [voiceledger-integration.md](voiceledger-integration.md).
- [x] **Faucet:** `cofi-faucet` account, `POST /api/wallet/fund` (once per user, exactly-once with hash reconciliation), `GET /api/wallet`; Friendbot hash recorded for own wallets.
- [x] **Web app:** `WalletCard` with address, balance and funding transaction on home and profile; Cavos account creation on first use (1-stroop `execute`).
- [x] Review findings R7 (refresh URL), R8 (signer check), R9 (delete with role) and R10 (per-account lock, in process).
- [ ] Check the Cavos account creation + faucet in a real browser login (needs Jonatan).
- [ ] Staging and Supabase (postponed), together with R6 (cross-domain cookies).

**Week 0 decisions:**

- **Farmer's on-chain ID:** `farmer_ref` = cooperative code + their ID, for example `KK-ID001`. The IDs each cooperative assigns are only unique within that cooperative.
- **Contract numeric IDs:** cooperatives 1 to 3, union 100, centers 11 to 34. They cannot change once batches exist.
- **Staff Stellar accounts:**
  - People with their own wallet: on testnet, Friendbot creates the account on first login. The backend never spends its own balance on it.
  - People using Cavos: Cavos creates it. If the backend gets there first, Cavos sees the account without its data and leaves the user waiting to approve their device. That is why the Cavos faucet happens in two steps (see [§2.3](#23-invisible-wallets-cavos-and-faucet)).
- **Cavos login signature:** Cavos does not sign with SEP-53.
  - It adds its own prefix (`Cavos Signed Message:\n<length>\n`).
  - It signs with the device's "control key", which may not be the same address as the account.
  - The backend verifies the signature with that key. If it is not the account, it checks on Horizon that the key signs for it.

---

## 1. What the SOW promises and how we deliver it

| SOW deliverable | Budget | What we build | Evidence we hand in |
|---|---|---|---|
| **1. Frictionless Auth & Invisible Wallets** | USD 1100 | Email (and Telegram) login through Cavos. Invisible Stellar wallet, funded with testnet XLM by an automatic faucet. | Staging link with email login, and the GitHub repo. |
| **2. Role-Based Traceability Smart Contracts** | USD 2300 | `traceability` v1 contract with role-based permissions. The farmer creates their profile (editable) and records deliveries (immutable). The Collector adds weight and receipt (immutable). After that only the stage changes or documents are attached. | Contract deployed on Stellar Expert, tests and 3 on-chain proofs: **1)** a farmer creates a batch; **2)** a Collector adds an authorized event; **3)** an unauthorized attempt is rejected by the contract. |
| **3. UI for State Tracking & Export** | USD 1600 | Web app where each user does what their role allows, views the batch history, uploads documents and exports CSV. | Video: a user creates a batch and the transaction hash is shown. Another user views the history, uploads a document and exports a CSV. |

**Outside the SOW scope:** fiat ramps, escrow or revenue sharing, personal data on chain, legal certification for Europe, the 200-farmer pilot and the marketplace logic.

**SOW weekly plan** (what the Ambassador reviews):

| Week | The SOW says | Our plan |
|---|---|---|
| 1 (Nov 16–20) | Cavos with email, invisible wallet and testnet faucet | Same, plus the farmer-agent wallet, the VoiceLedger integration endpoint and the farmer's on-chain registration. |
| 2 (Nov 23–27) | Role-permissioned contracts with immutable changes, tested locally | Same, and **we bring the testnet deploy forward**. The API already receives profile, practices and deliveries from VoiceLedger. |
| 3 (Nov 30 – Dec 4) | Testnet deploy and frontend: write data, upload documents, export CSV | Same. |
| 4 (Dec 7–11) | End-to-end tests, automated permission tests, demo and documentation | Same. |

---

## 2. Design

### 2.1 Architecture

```
Farmer ── Telegram/voice ──► VoiceLedger bot ── signed JSON ──► Integration API ──► farmer-agent wallet ──┐
                                   ▲                                                                       │
                                   └──────────── weight and stage notices (webhook) ◄── Backend            ▼
Coop/union staff ── Web app (Cavos) ── signs ──► Backend API ──► traceability contract (Stellar)
                                                     │
                                                     └──► Postgres + Supabase Storage
```

**General rule: no personal data goes on chain.** Only these go on chain:

- pseudonymous identifiers (`farmer_ref`, batch number);
- the stage, who made each change and the date;
- the **hash** of the full record and of each document.

The full record lives in Postgres and the files in Supabase Storage. The backend recomputes the hash and compares it with the one on Stellar. That way anyone can check that the record was not altered, and the batch page shows "Verified on Stellar".

| Data | Where |
|---|---|
| Name, phone, family, location, plot GPS | Off chain |
| Farm profile and practices | Off chain, with the hash on chain. Editable; each version leaves its hash. |
| EUDR consent | Off chain, with the hash on chain recorded by the farmer-agent wallet |
| Delivery: batch, `farmer_ref`, collection center | On chain, plus the hash of the details |
| Weight and receipt | Weight on chain; the receipt in Storage, with its hash on chain |
| Stage change | On chain: actor, stage, date and hash. The details, off chain. |
| Documents | Supabase Storage, with the hash on chain |

### 2.2 `traceability` contract v1

Changes from the deployed v0:

- **The farmer no longer has an address.** They are identified by `farmer_ref`.
- **The farmer-agent wallet** is set in the contract (`set_farmer_agent`, admin). It is the only one that can perform farmer actions.
- **The farmer creates the batch** (their delivery), not the Collector.
- **Weight and receipt** are recorded only once.
- **Documents attached** to the batch.

**Functions:**

| Function | Who | What it does |
|---|---|---|
| `grant_role`, `revoke_role`, `set_farmer_agent`, `set_admin`, `upgrade` | Admin | Administration |
| `register_farmer(farmer_ref, coop)` | Farmer-agent wallet | Registers the farmer when VoiceLedger tells us they linked. |
| `record_consent(farmer_ref, consent_hash)` | Farmer-agent wallet | Records the EUDR consent. |
| `set_profile(farmer_ref, profile_hash)` | Farmer-agent wallet | Farm profile and practices. **Editable:** each version emits an event with its hash. |
| `create_batch(batch_id, farmer_ref, center, data_hash)` | Farmer-agent wallet | **Delivery record. Immutable.** The batch starts in the `Delivered` stage. |
| `record_reception(collector, batch_id, weight_grams, receipt_hash, data_hash)` | Collector of the batch's cooperative | **Weight and receipt, only once.** The batch moves to `Received`. |
| `advance_stage(actor, batch_id, stage, data_hash)` | Depends on the stage | Only moves forward. Validates the transition and the role. |
| `attach_document(actor, batch_id, doc_hash)` | Any role from the batch's cooperative, or the Export Manager | Attaches a document hash (bounded list). |
| `get_batch`, `get_farmer`, `get_member` | Anyone | Reads |

**Stages and who moves them:**

| Stage | Who |
|---|---|
| `Delivered` | Farmer (through the farmer-agent wallet) |
| `Received` | Collector |
| `Washing` | Industry Manager |
| `Fermentation` | Industry Manager (to be confirmed) |
| `Drying` | Industry Manager |
| `Storage` | Industry Manager or Store Keeper (to be confirmed) |
| `InTransportToUnion` | Store Keeper |
| `PreparedWithExportableBag` | Export Manager |
| `Sold` | Export Manager |

**Permission tests** (SOW evidence). Each case must be rejected:

- an arbitrary account tries to create a batch or record the weight;
- a Collector from another cooperative tries to record the weight;
- someone tries to record the weight twice;
- someone tries to create a batch with an ID that already exists;
- someone tries to go back or skip stages;
- a role tries to move a stage that is not theirs;
- the farmer-agent wallet tries to do something reserved for staff;
- someone other than the admin tries to assign roles.

To make the rejection **visible in the explorer**, the evidence script submits one of these transactions without simulating it first. It shows up as a failed transaction on Stellar Expert, with the contract's error code.

### 2.3 Invisible wallets (Cavos) and faucet

- Cavos creates a **classic Stellar account (G…)**. The key lives in its vault, and the user never sees seed phrases.
- **Deployment is deferred:** Cavos does not create the account at login, but on the first operation (`execute`), sponsored by its relayer.
- **The faucet cannot run before Cavos.** If the backend creates the account first, for example with Friendbot, Cavos sees it without its data and blocks the user.

**Flow:**

1. On first login, the web app asks Cavos to create the account.
2. Once the account exists, the web app notifies the backend.
3. The backend sends testnet XLM from a **faucet account**, which in turn is topped up with Friendbot. It does this only once per user and records it in the database.

Accounts with their own wallet are funded directly with Friendbot.

**Week 1 spike:** Cavos does not expose a public "deploy".

- `execute(amount, destination)` creates the account and then tries a payment, which fails because the account is left with 0 XLM.
- Options to try:
  - `execute` with a minimal amount, accepting that the payment fails;
  - asking Cavos for a deploy without a payment;
  - sending the XLM from the faucet right after creation.

**Staff transaction signing:**

1. The backend builds the unsigned invocation (`TxBuilder`).
2. The web app signs it with `wallet.signXdr`.
3. The backend submits it with fee-bump (`TxSubmitter`).

The account has to exist before signing, and the faucet guarantees that. If `signXdr` causes problems, the alternative is `wallet.invokeContract` with the Cavos relayer.

### 2.4 VoiceLedger integration (farmers)

**Split of work:**

- **VoiceLedger:** the Telegram bot, voice (recognition in the local languages), the bot's texts and translations, and the conversation with the farmer.
- **Us:** the API that receives their messages, validation, the database, the on-chain writes with the farmer-agent wallet and the notifications back.

**How they connect (proposal to agree with them):**

- Route `POST /integrations/voiceledger/events`, one event per message.
- **Authentication:** HMAC-SHA256 signature of the body with a shared secret, plus a timestamp. Invalid signatures and messages older than 5 minutes are rejected.
- **No duplicates:** each event carries an `event_id`. If it arrives twice, we return the same response without writing on chain again.
- **Response:** the result and the Stellar Expert link to the transaction, so the bot can show it to the farmer. If confirmation takes a while, we respond `202` and the result can be fetched with `GET /integrations/voiceledger/events/:event_id`.
- **Errors** with stable codes (`FARMER_NOT_FOUND`, `FARMER_REF_TAKEN`, `INVALID_PAYLOAD`…), so the bot knows what to tell the farmer.
- We store every message we receive. If VoiceLedger sends the transcript or an audio reference, we store that too, as an off-chain backup.

**Sprint events:**

| Event | What they send | What we do |
|---|---|---|
| `farmer.linked` | Cooperative code, farmer ID, Telegram user, language | Check the ID against the list and call `register_farmer`. Respond with the `farmer_ref`. |
| `farmer.consent` | Text version, the 3 accepted declarations, date, language | Store it and call `record_consent` with the hash. We define the text and its versions and hand them to VoiceLedger. |
| `farmer.profile` | Basic data, plots (fachasa and GPS with its source), practices | Convert fachasa to hectares, check that the GPS point falls inside Gomma, store a new version and call `set_profile`. An edit is another event of the same type. |
| `delivery.created` | `farmer_ref`, collection center, and optionally estimated kg and ripeness | Generate the number `DD-MM-YYYY [FarmerID]`, call `create_batch` and respond with the number. |

**Back to VoiceLedger:** when the Collector records the weight or the batch changes stage, we send them a signed webhook so the bot can notify the farmer. If they prefer to poll, we expose a farmer's batches. To be agreed with them.

**So we do not depend on their schedule:** a **simulator** (a script that sends the same signed JSON) and OpenAPI documentation with examples. With the simulator we test everything and, if the bot is not ready in time, we can still produce the "a farmer creates a batch" evidence: the transaction is the same.

**Outside the sprint:** land tenure and tree photos, the full step 1.5 questionnaire from the PDF, and querying "my batches" (unless there is time left).

### 2.5 Data model (changes to what already exists)

- **`Farmer`:**
  - `walletAddress` is removed, and `registerTx` becomes the farmer-agent wallet's transaction;
  - the profile (versioned JSON), `profileHash` and `profileTx` are added.
- **`Plot`:** size in fachasa and in hectares, and GPS point with its source (shared or typed).
- **`Batch`:**
  - number, farmer, center and stage;
  - delivery data: estimated kg and ripeness;
  - reception data: weight and receipt;
  - `createTx` and `receptionTx`.
- **`BatchEvent`:** stage, actor, stage data (JSON), `dataHash` and `txHash`.
- **`Document`:** batch, type, file in Storage, `sha256`, uploader and `txHash`.
- **`User`:** `fundedAt` and `fundTx` (faucet).

---

## 3. Weekly milestones

### Week 0 (Nov 9–13): preparation

What is already done is listed under [Status](#status). Still to do:

- Propose the JSON contract (§2.4) and staging to VoiceLedger.
- Tell Alejandra about the change for farmers without wallets.

### Week 1 (Nov 16–20): Auth and invisible wallets — *SOW deliverable 1*

**Goal:** staff sign in with email from their phone and get a funded Stellar address without doing anything. A farmer who links through the VoiceLedger bot is registered on chain.

- Cavos on staging, with the real App ID, for email and Telegram.
- Deploy the Cavos account on first login (spike in §2.3).
- **Faucet:**
  - the faucet account is topped up with Friendbot;
  - endpoint `POST /wallet/fund`, one top-up per user;
  - for own wallets, Friendbot directly.
- Profile and home page: address, XLM balance and Stellar Expert link.
- **Farmer-agent wallet:**
  - `cofi-farmer-agent` identity, funded and configured in the backend;
  - a service to sign and submit with that account.
- **VoiceLedger integration:**
  - endpoint with HMAC signature, timestamp and `event_id` (§2.4);
  - `farmer.linked` calls `register_farmer` with the farmer-agent wallet, on an adapted v0 contract or directly on v1 if it is ready.
- Staging accessible to Karla, WHH and VoiceLedger (API URL and integration secret).

**Visual demo:**

1. Email login on a phone.
2. The address appears on the profile with its balance, and the faucet payment is visible on Stellar Expert.
3. A farmer links (through the VoiceLedger bot, or the simulator if it is not ready) and the response includes the link to their on-chain registration.

**SOW evidence:** staging link and the repo.

### Week 2 (Nov 23–27): Role-permissioned contracts — *SOW deliverable 2*

**Goal:** the v1 contract enforces who can do what, and the API already receives everything about the farmer from VoiceLedger, up to recording a delivery.

- `traceability` v1 contract (§2.2):
  - farmer-agent wallet, editable profile, immutable delivery, immutable weight and receipt, stages and documents;
  - **permission tests**, covering every case in §2.2;
  - testnet deploy (brought forward from SOW week 3) and farmer-agent wallet configuration.
- Backend:
  - v1 contract client;
  - `Farmer` and `Batch` migration;
  - the farmer service signs with the farmer-agent wallet.
- VoiceLedger API:
  - EUDR consent;
  - farm profile and practices, with editing;
  - delivery recording (`create_batch`);
  - simulator and OpenAPI documentation.

**Visual demo:**

1. A farmer accepts the consent, adds their farm and records a delivery through the VoiceLedger bot (or the simulator). Each step has its Stellar Expert link.
2. `cargo test` output with the unauthorized cases rejected.

**SOW evidence:** the contract on the explorer and the repo with the tests.

### Week 3 (Nov 30 – Dec 4): Frontend for the full flow — *SOW deliverable 3*

**Goal:** each role does its part in the web app, and any member can view the batch history, upload documents and export CSV.

- **Collector:**
  - sees the pending deliveries of their cooperative;
  - records the weight and uploads the receipt photo (`record_reception`, signed with their Cavos wallet).
- **Industry Manager, Store Keeper and Export Manager:** advance the stage with a short form per stage (notes and key fields from the PDF) and an optional photo.
- **Documents:** any role from the cooperative, or the Export Manager, uploads a file. It is stored in Storage and its hash goes on chain with `attach_document`.
- **Batches:**
  - list with filters by cooperative, center and stage;
  - **batch page** with the timeline: who, when, documents, a link to each transaction and "Verified on Stellar".
- **CSV export:**
  - batches with their history (pseudonymous IDs, no personal data);
  - farmers with their status (staff only).
- Notifications to VoiceLedger when the weight is recorded and on every stage change, so their bot can message the farmer.
- Cavos signing: `signXdr` with our fee-bump, or `invokeContract` if `signXdr` fails.

**Visual demo:** the farmer records their delivery through the VoiceLedger bot. The Collector weighs it in the web app and the farmer receives "Your batch 01-12-2026 KK-ID001 was received at Kirkir: 45 kg". The batch advances a stage, someone uploads a document and the CSV is exported.

### Week 4 (Dec 7–11): Tests, demo and documentation — *SOW close*

**Goal:** everything tested end to end, with the evidence ready for the Ambassador.

- **End-to-end script on testnet** (`scripts/`). It runs through the whole flow and produces the list of evidence transactions:
  1. a farmer creates a batch;
  2. a Collector adds an authorized event;
  3. an unauthorized attempt is rejected.
- Automated permission tests in CI: the contract's, plus the API's (every role against every endpoint, and the integration with an invalid signature, a repeated message and an ID that is not on the list).
- Validation with test users: Karla, WHH and a few farmers and cooperative staff. Fix whatever comes up.
- **Open-source documentation:** README for each part, architecture, how to run it and how to verify a batch.
- **Demo video:**
  1. email login;
  2. delivery through the VoiceLedger bot (or the simulator);
  3. weight;
  4. stages;
  5. document;
  6. history;
  7. CSV.
- **List of transactions** on Stellar Expert for the hand-in.
- December 14 and 15: buffer for adjustments and the hand-in to Alejandra.

### What gets cut first if we fall behind

What we **do not touch** is what the SOW asks for as evidence: email login with a funded wallet, the contract with its tests, the 3 on-chain proofs, batch creation, history, documents and CSV.

Cuts happen in this order:

1. Notifications to VoiceLedger (the farmer can ask the coop).
2. Profile editing (only the initial upload remains, also on chain).
3. Stage-specific forms (notes and photo remain).
4. Telegram login for staff (email remains, which is what the SOW requires).
5. The farmer CSV (the batch CSV remains).

---

## 4. Open questions

**Week 0 or 1**

- [ ] **Cavos:**
  - App ID (Jonatan);
  - does the relayer sponsor testnet accounts on our plan?
  - is there a way to create the account without a payment?
- [ ] **VoiceLedger:** do they accept the JSON contract in §2.4? When will the bot be on staging? Will they send a transcript or audio? Notifications by webhook or by polling? Which languages does the voice recognition support?
- [ ] Where is staging hosted?
- [ ] Does Alejandra agree with farmers signing through the backend wallet?
- [ ] Who are the week 4 test users, and when are they available?

**Week 2**

- [ ] Conversion factor from **fachasa to hectares**.
- [ ] Which minimum fields does the farm profile have, and which practices are asked about in this version?
- [ ] Who reviews the web app translations to Afaan Oromoo and Amharic?

**Week 3**

- [ ] If a farmer delivers twice on the same day, does the batch number get a suffix?
- [ ] Is Fermentation a stage of its own or part of Washing? Is Storage set by the Industry Manager or the Store Keeper?
- [ ] Which documents are uploaded, and at which stage (receipt, certificates, sales documents)?
- [ ] Which columns do they need in the CSV?

---

## 5. Risks

- **Cavos:**
  - The SDK is very new: Telegram login was released on November 5.
  - Account deployment has no public function (see the spike in §2.3).
  - Mitigation: login with your own Stellar wallet still works, and the backend already verifies both kinds of signature.
- **Change from the SOW (farmers without wallets):** to be discussed with Alejandra in week 0 or 1, before handing in evidence.
- **A single wallet for all farmers:**
  - If its key leaks, someone could record fake deliveries, but could not touch stages, weights or roles.
  - The key lives only in the backend, and the admin can replace the wallet with `set_farmer_agent`.
- **Typed GPS:** error-prone. We check that the coordinates fall inside Gomma and ask for confirmation.
- **Dependency on VoiceLedger:** the "a farmer creates a batch" evidence goes through their bot. Mitigation: agree on the JSON contract in week 0 and have the simulator by week 2; the on-chain transaction is the same whether it comes from their bot or the simulator.
- **Data that arrives by voice:** it may be mis-transcribed (IDs, kg, coordinates). We validate everything on our side and return clear errors so the bot can ask for confirmation.
- **Answers from Ethiopia:** if they do not arrive in time, we move forward with configurable assumptions.

---

## 6. Backlog after the Instaward

What Karla's PDF asks for and the SOW does not cover. It is the candidate scope for the next Instaward or the SCF Build Award, and to prepare the 200-farmer pilot.

- Upload and onboarding of the 200 farmers, plus field QA with basic phones and slow connections.
- The full step 1.5 questionnaire (practices, plus the 6 extra points), land tenure and tree photos.
- Polygons for farms of 4 ha or more, and a plot map.
- EUDR reports: GeoJSON for the due diligence statement, and volume by quality and region.
- KPI dashboard (farmers, batches per stage, kg, prices and amounts paid).
- Daily price per cooperative (Committee Member), cooperative financial records, quality grading and sale data (price and costs).
- Public batch page with a QR code. Depends on which information is public and which is members-only.
- Querying "my batches" from the VoiceLedger bot, and a sale notification.
- Professional review of the web app translations.
