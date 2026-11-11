#![no_std]
//! CofiBlocks coffee batch traceability (Ethiopia pilot).
//!
//! What it stores and what it does not:
//!
//! * **Nothing personal.** Farmers are identified by the pseudonymous ID their
//!   cooperative assigns them (`farmer_ref`). Names, phone numbers, GPS points
//!   and documents live off chain.
//! * **Hashes of the full records.** Each stage stores the SHA-256 of the
//!   off-chain record (`data_hash`). Recomputing and comparing it proves the
//!   record was not altered.
//! * **Who did what.** Each change is signed by the actor's account, and the
//!   contract checks that their role and organization allow it.
//!
//! Farmers have no wallet (one cannot be embedded in Telegram). Every farmer
//! action — registration, consent, profile and deliveries — is signed by a
//! single backend account, the **farmer agent**, which the admin sets with
//! `set_farmer_agent`. The agent can do nothing reserved for staff.
//!
//! Batch flow: the farmer agent records the delivery (`Delivered`, immutable);
//! the cooperative's Collector records the weight and receipt once
//! (`Received`, immutable); after that the batch only moves forward through
//! its stages or gets documents attached.

mod events;
mod storage;
mod types;

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, String, Vec};

pub use crate::types::{Batch, DataKey, Error, Farmer, Member, Role, Stage, StageRecord};

/// Maximum length of a batch number or a `farmer_ref`.
pub const MAX_ID_LEN: u32 = 64;

/// Maximum number of documents attached to a batch.
pub const MAX_DOCUMENTS: u32 = 20;

#[contract]
pub struct Traceability;

#[contractimpl]
impl Traceability {
    pub fn __constructor(env: Env, admin: Address) {
        storage::set_admin(&env, &admin);
        storage::extend_instance(&env);
    }

    // ── roles ─────────────────────────────────────────────────────────────

    /// Assigns a staff role within `org`.
    ///
    /// An account has a single role: assigning another replaces the previous
    /// one. The farmer agent can never hold a staff role.
    pub fn grant_role(env: Env, account: Address, role: Role, org: u32) -> Result<(), Error> {
        Self::require_admin(&env)?;
        if storage::get_farmer_agent(&env) == Some(account.clone()) {
            return Err(Error::Unauthorized);
        }
        storage::set_member(&env, &account, &Member { role, org });
        events::RoleGranted { account, role, org }.publish(&env);
        Ok(())
    }

    /// Removes the account's role.
    pub fn revoke_role(env: Env, account: Address) -> Result<(), Error> {
        Self::require_admin(&env)?;
        storage::get_member(&env, &account).ok_or(Error::NotAMember)?;
        storage::remove_member(&env, &account);
        events::RoleRevoked { account }.publish(&env);
        Ok(())
    }

    pub fn get_member(env: Env, account: Address) -> Option<Member> {
        storage::get_member(&env, &account)
    }

    // ── farmer agent ──────────────────────────────────────────────────────

    /// Sets the backend account that signs every farmer action. Replacing it
    /// (for example if its key leaks) immediately locks out the old one.
    pub fn set_farmer_agent(env: Env, agent: Address) -> Result<(), Error> {
        Self::require_admin(&env)?;
        if storage::get_member(&env, &agent).is_some() {
            return Err(Error::Unauthorized);
        }
        storage::set_farmer_agent(&env, &agent);
        events::FarmerAgentSet { agent }.publish(&env);
        Ok(())
    }

    pub fn get_farmer_agent(env: Env) -> Option<Address> {
        storage::get_farmer_agent(&env)
    }

    // ── farmers (signed by the farmer agent) ──────────────────────────────

    /// Registers a farmer by their cooperative ID.
    ///
    /// The backend calls it after checking the ID against the cooperative's
    /// list. Calling it again with the same cooperative is harmless; the same
    /// `farmer_ref` under another cooperative is rejected.
    pub fn register_farmer(env: Env, farmer_ref: String, coop: u32) -> Result<(), Error> {
        Self::require_farmer_agent(&env)?;
        Self::check_id(&farmer_ref)?;
        match storage::get_farmer(&env, &farmer_ref) {
            Some(existing) if existing.coop != coop => return Err(Error::FarmerRefTaken),
            Some(_) => {}
            None => storage::set_farmer(
                &env,
                &Farmer {
                    farmer_ref: farmer_ref.clone(),
                    coop,
                    consent_hash: None,
                    consent_at: 0,
                    profile_hash: None,
                    profile_at: 0,
                },
            ),
        }
        events::FarmerRegistered { farmer_ref, coop }.publish(&env);
        Ok(())
    }

    /// Records the farmer's GDPR/EUDR consent and its declarations.
    ///
    /// `consent_hash` is the SHA-256 of the accepted text and the checked
    /// declarations. Recording it again replaces the previous one (e.g. a new
    /// version of the text); the history stays in the events.
    pub fn record_consent(env: Env, farmer_ref: String, consent_hash: BytesN<32>) -> Result<(), Error> {
        Self::require_farmer_agent(&env)?;
        let mut farmer = storage::get_farmer(&env, &farmer_ref).ok_or(Error::FarmerNotFound)?;
        farmer.consent_hash = Some(consent_hash.clone());
        farmer.consent_at = env.ledger().timestamp();
        storage::set_farmer(&env, &farmer);
        events::ConsentRecorded {
            farmer_ref,
            consent_hash,
        }
        .publish(&env);
        Ok(())
    }

    /// Records a new version of the farm profile and practices. It is
    /// editable: each version emits an event with its hash.
    pub fn set_profile(env: Env, farmer_ref: String, profile_hash: BytesN<32>) -> Result<(), Error> {
        Self::require_farmer_agent(&env)?;
        let mut farmer = storage::get_farmer(&env, &farmer_ref).ok_or(Error::FarmerNotFound)?;
        farmer.profile_hash = Some(profile_hash.clone());
        farmer.profile_at = env.ledger().timestamp();
        storage::set_farmer(&env, &farmer);
        events::ProfileUpdated {
            farmer_ref,
            profile_hash,
        }
        .publish(&env);
        Ok(())
    }

    pub fn get_farmer(env: Env, farmer_ref: String) -> Option<Farmer> {
        storage::get_farmer(&env, &farmer_ref)
    }

    // ── batches ───────────────────────────────────────────────────────────

    /// Records a farmer's delivery. The batch starts in `Delivered`, belongs
    /// to the farmer's cooperative and cannot be modified afterwards.
    pub fn create_batch(
        env: Env,
        id: String,
        farmer_ref: String,
        collection_center: u32,
        data_hash: BytesN<32>,
    ) -> Result<(), Error> {
        let agent = Self::require_farmer_agent(&env)?;
        Self::check_id(&id)?;
        let farmer = storage::get_farmer(&env, &farmer_ref).ok_or(Error::FarmerNotFound)?;
        if storage::has_batch(&env, &id) {
            return Err(Error::BatchAlreadyExists);
        }

        let mut history = Vec::new(&env);
        history.push_back(StageRecord {
            stage: Stage::Delivered,
            actor: agent,
            timestamp: env.ledger().timestamp(),
            data_hash: data_hash.clone(),
        });
        storage::set_batch(
            &env,
            &Batch {
                id: id.clone(),
                farmer_ref: farmer_ref.clone(),
                coop: farmer.coop,
                collection_center,
                weight_grams: 0,
                receipt_hash: None,
                stage: Stage::Delivered,
                history,
                documents: Vec::new(&env),
            },
        );
        events::BatchCreated {
            id,
            farmer_ref,
            coop: farmer.coop,
            collection_center,
            data_hash,
        }
        .publish(&env);
        Ok(())
    }

    /// The Collector of the batch's cooperative records the weight and the
    /// receipt. It happens exactly once and moves the batch to `Received`.
    pub fn record_reception(
        env: Env,
        collector: Address,
        id: String,
        weight_grams: u64,
        receipt_hash: BytesN<32>,
        data_hash: BytesN<32>,
    ) -> Result<(), Error> {
        collector.require_auth();
        storage::extend_instance(&env);

        let member = storage::get_member(&env, &collector).ok_or(Error::NotAMember)?;
        if member.role != Role::Collector {
            return Err(Error::Unauthorized);
        }
        let mut batch = storage::get_batch(&env, &id)?;
        if member.org != batch.coop {
            return Err(Error::WrongOrganization);
        }
        if batch.stage != Stage::Delivered {
            return Err(Error::ReceptionAlreadyRecorded);
        }
        if weight_grams == 0 {
            return Err(Error::InvalidWeight);
        }

        batch.weight_grams = weight_grams;
        batch.receipt_hash = Some(receipt_hash.clone());
        batch.stage = Stage::Received;
        batch.history.push_back(StageRecord {
            stage: Stage::Received,
            actor: collector.clone(),
            timestamp: env.ledger().timestamp(),
            data_hash: data_hash.clone(),
        });
        storage::set_batch(&env, &batch);
        events::ReceptionRecorded {
            id,
            collector,
            weight_grams,
            receipt_hash,
            data_hash,
        }
        .publish(&env);
        Ok(())
    }

    /// Moves a batch to the next stage.
    ///
    /// Checks that the actor's role can move the batch to that stage
    /// (`Stage::allows`), that the actor belongs to the batch's cooperative and
    /// that the transition is valid (`Stage::can_follow`). The Export Manager
    /// works at union level, so they can move batches from any cooperative.
    pub fn advance_stage(
        env: Env,
        actor: Address,
        id: String,
        stage: Stage,
        data_hash: BytesN<32>,
    ) -> Result<(), Error> {
        actor.require_auth();
        storage::extend_instance(&env);

        let member = storage::get_member(&env, &actor).ok_or(Error::NotAMember)?;
        if !stage.allows(member.role) {
            return Err(Error::Unauthorized);
        }
        let mut batch = storage::get_batch(&env, &id)?;
        Self::check_organization(&member, &batch)?;
        if !stage.can_follow(batch.stage) {
            return Err(Error::InvalidTransition);
        }

        batch.stage = stage;
        batch.history.push_back(StageRecord {
            stage,
            actor: actor.clone(),
            timestamp: env.ledger().timestamp(),
            data_hash: data_hash.clone(),
        });
        storage::set_batch(&env, &batch);
        events::StageAdvanced {
            id,
            stage,
            actor,
            data_hash,
        }
        .publish(&env);
        Ok(())
    }

    /// Attaches a document's hash to a batch. Any role from the batch's
    /// cooperative can do it, and so can the Export Manager.
    pub fn attach_document(
        env: Env,
        actor: Address,
        id: String,
        doc_hash: BytesN<32>,
    ) -> Result<(), Error> {
        actor.require_auth();
        storage::extend_instance(&env);

        let member = storage::get_member(&env, &actor).ok_or(Error::NotAMember)?;
        let mut batch = storage::get_batch(&env, &id)?;
        Self::check_organization(&member, &batch)?;
        if batch.documents.contains(&doc_hash) {
            return Err(Error::DocumentAlreadyAttached);
        }
        if batch.documents.len() >= MAX_DOCUMENTS {
            return Err(Error::TooManyDocuments);
        }

        batch.documents.push_back(doc_hash.clone());
        storage::set_batch(&env, &batch);
        events::DocumentAttached {
            id,
            actor,
            doc_hash,
        }
        .publish(&env);
        Ok(())
    }

    pub fn get_batch(env: Env, id: String) -> Result<Batch, Error> {
        storage::get_batch(&env, &id)
    }

    // ── administration ────────────────────────────────────────────────────

    pub fn get_admin(env: Env) -> Result<Address, Error> {
        storage::get_admin(&env)
    }

    pub fn set_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        Self::require_admin(&env)?;
        storage::set_admin(&env, &new_admin);
        Ok(())
    }

    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
        Self::require_admin(&env)?;
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Ok(())
    }

    // ── internal ──────────────────────────────────────────────────────────

    fn require_admin(env: &Env) -> Result<(), Error> {
        storage::get_admin(env)?.require_auth();
        storage::extend_instance(env);
        Ok(())
    }

    /// Requires the farmer agent's signature and returns its address.
    fn require_farmer_agent(env: &Env) -> Result<Address, Error> {
        let agent = storage::get_farmer_agent(env).ok_or(Error::FarmerAgentNotSet)?;
        agent.require_auth();
        storage::extend_instance(env);
        Ok(agent)
    }

    /// Staff can only act on their own cooperative's batches, except the
    /// Export Manager, who works at union level.
    fn check_organization(member: &Member, batch: &Batch) -> Result<(), Error> {
        if member.role != Role::ExportManager && member.org != batch.coop {
            return Err(Error::WrongOrganization);
        }
        Ok(())
    }

    fn check_id(value: &String) -> Result<(), Error> {
        let len = value.len();
        if len == 0 || len > MAX_ID_LEN {
            return Err(Error::InvalidId);
        }
        Ok(())
    }
}
