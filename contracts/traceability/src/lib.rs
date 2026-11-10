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

mod events;
mod storage;
mod types;

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, String, Vec};

pub use crate::types::{Batch, DataKey, Error, Farmer, Member, Role, Stage, StageRecord};

/// Maximum length of a batch number or a `farmer_ref`.
pub const MAX_ID_LEN: u32 = 64;

#[contract]
pub struct Traceability;

#[contractimpl]
impl Traceability {
    pub fn __constructor(env: Env, admin: Address) {
        storage::set_admin(&env, &admin);
        storage::extend_instance(&env);
    }

    // ── roles ─────────────────────────────────────────────────────────────

    /// Assigns a staff role (anything but `Farmer`) within `org`.
    ///
    /// An account has a single role: assigning another replaces the previous one.
    pub fn grant_role(env: Env, account: Address, role: Role, org: u32) -> Result<(), Error> {
        Self::require_admin(&env)?;
        if role == Role::Farmer {
            return Err(Error::UseRegisterFarmer);
        }
        if let Some(previous) = storage::get_farmer(&env, &account) {
            storage::remove_farmer(&env, &account, &previous.farmer_ref);
        }
        storage::set_member(&env, &account, &Member { role, org });
        events::RoleGranted { account, role, org }.publish(&env);
        Ok(())
    }

    /// Removes the account's role. If it was a farmer, it also frees their
    /// `farmer_ref` so it can be linked to another wallet.
    pub fn revoke_role(env: Env, account: Address) -> Result<(), Error> {
        Self::require_admin(&env)?;
        storage::get_member(&env, &account).ok_or(Error::NotAMember)?;
        if let Some(farmer) = storage::get_farmer(&env, &account) {
            storage::remove_farmer(&env, &account, &farmer.farmer_ref);
        }
        storage::remove_member(&env, &account);
        events::RoleRevoked { account }.publish(&env);
        Ok(())
    }

    pub fn get_member(env: Env, account: Address) -> Option<Member> {
        storage::get_member(&env, &account)
    }

    // ── caficultores ──────────────────────────────────────────────────────

    /// Links a farmer's wallet to their cooperative ID.
    ///
    /// Signed by the admin (the backend) after the bot checked the ID against
    /// the cooperative's list. Calling it again for the same wallet and ID is
    /// harmless; an ID already linked to another wallet is rejected.
    pub fn register_farmer(
        env: Env,
        account: Address,
        farmer_ref: String,
        coop: u32,
    ) -> Result<(), Error> {
        Self::require_admin(&env)?;
        Self::check_id(&farmer_ref)?;
        if let Some(owner) = storage::get_farmer_by_ref(&env, &farmer_ref) {
            if owner != account {
                return Err(Error::FarmerRefTaken);
            }
        }
        if let Some(previous) = storage::get_farmer(&env, &account) {
            if previous.farmer_ref != farmer_ref {
                storage::remove_farmer(&env, &account, &previous.farmer_ref);
            }
        }

        storage::set_member(
            &env,
            &account,
            &Member {
                role: Role::Farmer,
                org: coop,
            },
        );
        storage::set_farmer(
            &env,
            &account,
            &Farmer {
                farmer_ref: farmer_ref.clone(),
                coop,
                consent_hash: None,
                consent_at: 0,
            },
        );
        storage::set_farmer_ref(&env, &farmer_ref, &account);
        events::FarmerRegistered {
            account,
            farmer_ref,
            coop,
        }
        .publish(&env);
        Ok(())
    }

    /// The farmer signs the GDPR/EUDR consent and its declarations.
    ///
    /// `consent_hash` is the SHA-256 of the accepted text and the checked
    /// declarations. Signing again replaces the previous one (e.g. a new
    /// version of the text); the history stays in the events.
    pub fn record_consent(env: Env, farmer: Address, consent_hash: BytesN<32>) -> Result<(), Error> {
        farmer.require_auth();
        storage::extend_instance(&env);

        let mut record = storage::get_farmer(&env, &farmer).ok_or(Error::FarmerNotFound)?;
        record.consent_hash = Some(consent_hash.clone());
        record.consent_at = env.ledger().timestamp();
        storage::set_farmer(&env, &farmer, &record);
        events::ConsentRecorded {
            account: farmer,
            consent_hash,
        }
        .publish(&env);
        Ok(())
    }

    pub fn get_farmer(env: Env, account: Address) -> Option<Farmer> {
        storage::get_farmer(&env, &account)
    }

    pub fn get_farmer_by_ref(env: Env, farmer_ref: String) -> Option<Address> {
        storage::get_farmer_by_ref(&env, &farmer_ref)
    }

    // ── lotes ─────────────────────────────────────────────────────────────

    /// The Coffee Collector records a delivery. The batch starts in `Received`
    /// and belongs to the collector's cooperative.
    ///
    /// It does not require the farmer to be registered on chain yet: during
    /// the pilot some farmers deliver before finishing registration through the
    /// bot. The link is resolved by `farmer_ref`.
    pub fn create_batch(
        env: Env,
        actor: Address,
        id: String,
        farmer_ref: String,
        collection_center: u32,
        weight_grams: u64,
        data_hash: BytesN<32>,
    ) -> Result<(), Error> {
        actor.require_auth();
        storage::extend_instance(&env);

        let member = storage::get_member(&env, &actor).ok_or(Error::NotAMember)?;
        if !Stage::Received.allows(member.role) {
            return Err(Error::Unauthorized);
        }
        Self::check_id(&id)?;
        Self::check_id(&farmer_ref)?;
        if weight_grams == 0 {
            return Err(Error::InvalidWeight);
        }
        if storage::has_batch(&env, &id) {
            return Err(Error::BatchAlreadyExists);
        }

        let mut history = Vec::new(&env);
        history.push_back(StageRecord {
            stage: Stage::Received,
            actor: actor.clone(),
            timestamp: env.ledger().timestamp(),
            data_hash: data_hash.clone(),
        });
        storage::set_batch(
            &env,
            &Batch {
                id: id.clone(),
                farmer_ref: farmer_ref.clone(),
                coop: member.org,
                collection_center,
                weight_grams,
                stage: Stage::Received,
                history,
            },
        );
        events::BatchCreated {
            id,
            farmer_ref,
            coop: member.org,
            collection_center,
            weight_grams,
            actor,
            data_hash,
        }
        .publish(&env);
        Ok(())
    }

    /// Moves a batch to the next stage.
    ///
    /// Checks that the transition is valid (`Stage::can_follow`), that the
    /// actor's role can move the batch to that stage (`Stage::allows`) and that
    /// the actor belongs to the batch's cooperative. The Export Manager works at
    /// union level, so they can move batches from any cooperative.
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
        if member.role != Role::ExportManager && member.org != batch.coop {
            return Err(Error::WrongOrganization);
        }
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

    // ── internos ──────────────────────────────────────────────────────────

    fn require_admin(env: &Env) -> Result<(), Error> {
        storage::get_admin(env)?.require_auth();
        storage::extend_instance(env);
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
