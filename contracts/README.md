# Contracts — CofiBlocks Traceability

The `traceability` contract, written in Rust for [Soroban](https://developers.stellar.org/docs/build/smart-contracts/overview), Stellar's smart contract platform. It is the system's public source of truth: who holds which role, which farmers are registered and which stages each batch went through.

> **Status:** **v1** is deployed on testnet and covers the full Instaward contract scope: farmer agent, immutable delivery, one-time weight and receipt, stages and documents, with permission tests. It replaced v0 on November 10, 2026.

## What it records

- **Staff roles**, each within an organization (a cooperative or the union).
- **Farmers**, identified only by a pseudonymous ID (`farmer_ref`, for example `KK-ID001`), with their cooperative and the hashes of their EUDR consent and farm profile.
- **Batches** and their journey through the stages: who made each change, when, and the hash of the full record for that stage, plus the weight, the receipt hash and attached documents.

**No personal data goes on chain.** Names, phone numbers, GPS points, photos and documents live off chain, in the backend. Each off-chain record is summarized as a SHA-256 (`data_hash`, `consent_hash`, `profile_hash`, `receipt_hash`, `doc_hash`): if someone recomputes the hash and it matches, the record was not altered.

**Farmers have no wallet** (one cannot be embedded in Telegram). Every farmer action is signed by a single backend account, the **farmer agent**, which the admin sets with `set_farmer_agent`. The agent can do nothing reserved for staff, and staff cannot act as the agent.

## Layout

```
contracts/
├── Cargo.toml                 # workspace (soroban-sdk 27)
├── traceability/src/
│   ├── lib.rs                 # public contract functions
│   ├── types.rs               # Role, Stage, Member, Farmer, Batch and the errors
│   ├── storage.rs             # state reads and writes (with TTL extension)
│   ├── events.rs              # events emitted by each function
│   └── test.rs                # tests
├── scripts/deploy.sh          # build + deploy + set_farmer_agent, writes deployments/<network>.json
└── deployments/testnet.json   # contract and farmer agent addresses read by the backend
```

## Deployment on testnet

- Contract: [`CC4ZL3I3IDG5BNBBH4XRRM2CWG6VZHJEND2SAHLCY7ISMUEWIG5TW524`](https://stellar.expert/explorer/testnet/contract/CC4ZL3I3IDG5BNBBH4XRRM2CWG6VZHJEND2SAHLCY7ISMUEWIG5TW524)
- Admin: the `cofi-admin` identity (the backend's account).
- Farmer agent: the `cofi-farmer-agent` identity.

## Batch flow

1. The farmer agent records the farmer's delivery with `create_batch`. The batch starts in `Delivered` and that record is immutable.
2. The Collector of the batch's cooperative records the weight and the receipt with `record_reception`, exactly once. The batch moves to `Received`.
3. From then on the batch only moves forward through its stages (`advance_stage`) or gets documents attached (`attach_document`).

## Functions

| Function | Signed by | What it does |
|---|---|---|
| `grant_role(account, role, org)` | admin | Assigns a staff role. Never to the farmer agent. |
| `revoke_role(account)` | admin | Removes the role. |
| `set_farmer_agent(agent)` | admin | Sets the account that signs farmer actions. Replacing it locks out the old one. |
| `register_farmer(farmer_ref, coop)` | farmer agent | Registers a farmer. Repeating it with the same cooperative is harmless. |
| `record_consent(farmer_ref, consent_hash)` | farmer agent | Records the EUDR consent. |
| `set_profile(farmer_ref, profile_hash)` | farmer agent | Records a new version of the farm profile and practices (editable). |
| `create_batch(id, farmer_ref, collection_center, data_hash)` | farmer agent | Records a delivery. The batch starts in `Delivered`. |
| `record_reception(collector, id, weight_grams, receipt_hash, data_hash)` | Collector of the batch's cooperative | Weight and receipt, once. The batch moves to `Received`. |
| `advance_stage(actor, id, stage, data_hash)` | the stage's role | Moves the batch to the next stage. |
| `attach_document(actor, id, doc_hash)` | any role from the batch's cooperative, or the Export Manager | Attaches a document hash (at most 20, no duplicates). |
| `get_member`, `get_farmer`, `get_farmer_agent`, `get_batch`, `get_admin` | — | Reads. |
| `set_admin`, `upgrade` | admin | Administration. |

### Stages and roles

| Stage | Reached with | By |
|---|---|---|
| `Delivered` | `create_batch` | farmer agent |
| `Received` | `record_reception` | `Collector` |
| `Washing`, `Fermentation`, `Drying` | `advance_stage` | `IndustryManager` |
| `Storage` | `advance_stage` | `IndustryManager` or `StoreKeeper` |
| `InTransportToUnion` | `advance_stage` | `StoreKeeper` |
| `PreparedWithExportableBag`, `Sold` | `advance_stage` | `ExportManager` |

- Stages advance one at a time. The only one that can be skipped is `Fermentation` (Washing → Drying), until Ethiopia confirms whether it is a stage of its own.
- A cooperative's staff can only act on that cooperative's batches. The Export Manager works at union level and can act on anyone's batches.
- `CommitteeMember` does not move batches (they set daily prices, which are stored off chain), but can attach documents.
- Each account has a single role.

### Events

`role_granted`, `role_revoked`, `farmer_agent_set`, `farmer_registered`, `consent_recorded`, `profile_updated`, `batch_created`, `reception_recorded`, `stage_advanced` and `document_attached`. The backend uses them to verify each transaction, rebuild the history and link each change to its transaction.

### Errors

| Code | Error | When |
|---|---|---|
| 1 | `NotInitialized` | The contract has no admin. |
| 2 | `NotAMember` | The account has no role. |
| 3 | `Unauthorized` | The role does not allow the operation. |
| 4 | `WrongOrganization` | The batch belongs to another cooperative. |
| 5 | `FarmerAgentNotSet` | The admin has not set the farmer agent yet. |
| 6 | `FarmerNotFound` | The farmer is not registered. |
| 7 | `FarmerRefTaken` | That `farmer_ref` is registered with another cooperative. |
| 8 | `BatchAlreadyExists` | A batch with that ID already exists. |
| 9 | `BatchNotFound` | The batch does not exist. |
| 10 | `InvalidTransition` | The stage cannot follow the current one. |
| 11 | `InvalidWeight` | The weight is zero. |
| 12 | `InvalidId` | Empty or too-long ID. |
| 13 | `ReceptionAlreadyRecorded` | The weight and receipt were already recorded. |
| 14 | `TooManyDocuments` | The batch already has 20 documents. |
| 15 | `DocumentAlreadyAttached` | That document is already attached. |

### Permission tests (Instaward evidence)

`test.rs` has 29 tests. These cases from the SOW must be rejected, and each has its own test:

- an arbitrary account creates a batch or records the weight;
- a Collector from another cooperative records the weight;
- the weight is recorded twice;
- a batch is created with an ID that already exists;
- a stage goes backwards or skips ahead;
- a role moves a stage that is not theirs;
- the farmer agent does something reserved for staff;
- someone other than the admin assigns roles.

## Development

**Requirements:**

```bash
rustup target add wasm32v1-none
cargo install --locked stellar-cli
```

**Tests:**

```bash
cargo test --workspace
```

**Build.** Leaves the WASM at `target/wasm32v1-none/release/traceability.wasm`:

```bash
stellar contract build
```

**Deployment.** First create and fund the three backend identities (admin, farmer agent, faucet):

```bash
../scripts/setup-testnet.sh
```

Then deploy:

```bash
./scripts/deploy.sh testnet
```

The script builds, uploads and deploys the contract with `STELLAR_ADMIN_IDENTITY` (`cofi-admin` by default) as admin, calls `set_farmer_agent` with `STELLAR_FARMER_AGENT_IDENTITY` (`cofi-farmer-agent` by default), and writes `deployments/<network>.json`.

After a new deployment:

- update the address in `backend/src/lib/StellarContracts/deployments.ts` (or set `STELLAR_TRACEABILITY_ADDRESS`);
- run `npm run chain:sync-roles` in the backend, so the roles stored in the database are written to the new contract.

The organizations' numeric IDs (cooperatives 1 to 3, union 100, centers 11 to 34) are set by the backend seed and cannot change once batches exist.
