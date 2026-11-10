# Contracts — CofiBlocks Traceability

The `traceability` contract, written in Rust for [Soroban](https://developers.stellar.org/docs/build/smart-contracts/overview), Stellar's smart contract platform. It is the system's public source of truth: who holds which role, which farmers are registered and which stages each batch went through.

> 🚧 **Status:** **v0** is deployed on testnet and is what the backend uses today. **v1**, which covers the full Instaward scope, is built in week 2 (Nov 23–27). Both are described below.

## What it records

- **Staff roles**, each within an organization (a cooperative or the union).
- **Farmers**, identified by a pseudonymous ID (`farmer_ref`, for example `KK-ID001`), with their cooperative and the hash of their EUDR consent.
- **Batches** and their journey through the stages: who made each change, when, and the hash of the full record for that stage.

**No personal data goes on chain.** Names, phone numbers, GPS points, photos and documents live off chain, in the backend. Each off-chain record is summarized as a SHA-256 (`data_hash`, `consent_hash`): if someone recomputes the hash and it matches, the record was not altered.

## Layout

```
contracts/
├── Cargo.toml                 # workspace (soroban-sdk 27)
├── traceability/src/
│   ├── lib.rs                 # public contract functions
│   ├── types.rs               # Role, Stage, Member, Farmer, Batch and the errors
│   ├── storage.rs             # state reads and writes
│   ├── events.rs              # events emitted by each function
│   └── test.rs                # tests
├── scripts/deploy.sh          # build + deploy, writes deployments/<network>.json
└── deployments/testnet.json   # contract address read by the backend
```

## v0 (deployed)

On testnet: [`CAFZUGHOGCYW2ULV4ZN62T5EC7IPYZXTBKVCA3QUKO3QWJHQ5X6KB32Z`](https://stellar.expert/explorer/testnet/contract/CAFZUGHOGCYW2ULV4ZN62T5EC7IPYZXTBKVCA3QUKO3QWJHQ5X6KB32Z). The admin is the `cofi-admin` identity, which is the backend's account.

### Functions

| Function | Signed by | What it does |
|---|---|---|
| `grant_role(account, role, org)` | admin | Assigns a staff role. |
| `revoke_role(account)` | admin | Removes the role. If it was a farmer, frees their `farmer_ref`. |
| `register_farmer(account, farmer_ref, coop)` | admin | Links a farmer's wallet to their cooperative ID. |
| `record_consent(farmer, consent_hash)` | farmer | Records the EUDR consent. |
| `create_batch(actor, id, farmer_ref, collection_center, weight_grams, data_hash)` | Collector | Creates the batch in the `Received` stage. |
| `advance_stage(actor, id, stage, data_hash)` | the stage's role | Moves the batch to the next stage. |
| `get_member`, `get_farmer`, `get_farmer_by_ref`, `get_batch`, `get_admin` | — | Reads. |
| `set_admin`, `upgrade` | admin | Administration. |

### Stages and roles

| Stage | Set by |
|---|---|
| `Received` (with `create_batch`) | `Collector` |
| `Washing`, `Fermentation`, `Drying` | `IndustryManager` |
| `Storage` | `IndustryManager` or `StoreKeeper` |
| `InTransportToUnion` | `StoreKeeper` |
| `PreparedWithExportableBag`, `Sold` | `ExportManager` |

- Stages advance one at a time. The only one that can be skipped is `Fermentation` (Washing → Drying), until Ethiopia confirms whether it is a stage of its own.
- A cooperative's staff can only move that cooperative's batches. The Export Manager works at union level and can move anyone's batches.
- `CommitteeMember` does not move batches: they set daily prices, which are stored off chain.
- Each account has a single role.

### Events

`role_granted`, `role_revoked`, `farmer_registered`, `consent_recorded`, `batch_created` and `stage_advanced`. The backend uses them to rebuild the history and link each change to its transaction.

### Errors

| Code | Error | When |
|---|---|---|
| 1 | `NotInitialized` | The contract has no admin. |
| 2 | `NotAMember` | The account has no role. |
| 3 | `Unauthorized` | The role does not allow the operation. |
| 4 | `WrongOrganization` | The batch belongs to another cooperative. |
| 5 | `UseRegisterFarmer` | Someone tried to grant the farmer role with `grant_role`. |
| 6 | `FarmerNotFound` | The farmer does not exist. |
| 7 | `FarmerRefTaken` | That `farmer_ref` is already linked to another wallet. |
| 8 | `BatchAlreadyExists` | A batch with that ID already exists. |
| 9 | `BatchNotFound` | The batch does not exist. |
| 10 | `InvalidTransition` | The stage cannot follow the current one. |
| 11 | `InvalidWeight` | The weight is not valid. |
| 12 | `InvalidId` | Empty or too-long ID. |

## v1 (in progress)

Changes from v0, to cover the Instaward scope:

- **Farmers have no wallet.** Their actions are signed by a single backend **farmer-agent wallet**, which the admin sets with `set_farmer_agent`. On chain, a farmer is just their `farmer_ref`.
- **The farmer creates the batch** (their delivery), not the Collector. The batch starts in a new stage, `Delivered`, and that record is immutable.
- **The Collector records the weight and receipt exactly once** (`record_reception`). The batch moves to `Received`.
- **The farm profile is editable** (`set_profile`). Each version leaves its hash in an event.
- **Documents attached** to the batch (`attach_document`).

| New or changed function | Signed by |
|---|---|
| `set_farmer_agent(address)` | admin |
| `register_farmer(farmer_ref, coop)`, `record_consent(farmer_ref, hash)`, `set_profile(farmer_ref, hash)` | farmer-agent wallet |
| `create_batch(batch_id, farmer_ref, center, data_hash)` | farmer-agent wallet |
| `record_reception(collector, batch_id, weight_grams, receipt_hash, data_hash)` | Collector of the batch's cooperative |
| `attach_document(actor, batch_id, doc_hash)` | a role from the batch's cooperative, or the Export Manager |

The v1 permission tests are part of the Instaward evidence. Each of these cases must be rejected:

- an arbitrary account creates a batch or records the weight;
- a Collector from another cooperative records the weight;
- the weight is recorded twice;
- a batch is created with an ID that already exists;
- a stage goes backwards or skips ahead;
- a role moves a stage that is not theirs;
- the farmer-agent wallet does something reserved for staff;
- someone other than the admin assigns roles.

The full design is in [`docs/implementation-plan.md` §2.2](../docs/implementation-plan.md#22-traceability-contract-v1).

## Development

**Requirements:**

```bash
rustup target add wasm32v1-none
cargo install --locked stellar-cli
```

**Tests** (20 in v0):

```bash
cargo test --workspace
```

**Build.** Leaves the WASM at `target/wasm32v1-none/release/traceability.wasm`:

```bash
stellar contract build
```

**Deployment.** First you need a funded admin identity:

```bash
../scripts/setup-testnet.sh
```

Then deploy:

```bash
./scripts/deploy.sh testnet
```

The script builds, uploads and deploys the contract with the `STELLAR_ADMIN_IDENTITY` identity (`cofi-admin` by default) as admin, and writes `deployments/<network>.json`.

- That identity's secret key goes in the backend's `STELLAR_ADMIN_SECRET`. Get it with `stellar keys show cofi-admin`.
- The organizations' numeric IDs (cooperatives 1 to 3, union 100, centers 11 to 34) are set by the backend seed and cannot change once batches exist.
