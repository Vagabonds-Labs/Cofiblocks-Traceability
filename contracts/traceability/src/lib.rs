#![no_std]
//! Trazabilidad de lotes de café de CofiBlocks (piloto Etiopía).
//!
//! Qué guarda y qué no:
//!
//! * **Nada personal.** Los caficultores se identifican con el ID seudónimo que
//!   les asigna la cooperativa (`farmer_ref`). Nombres, teléfonos, GPS y
//!   documentos viven off-chain.
//! * **Hashes de los registros completos.** Cada etapa guarda el SHA-256 del
//!   registro off-chain (`data_hash`). Recalcularlo y compararlo prueba que el
//!   registro no se alteró.
//! * **Quién hizo qué.** Cada cambio lo firma la cuenta del actor, y el
//!   contrato valida que su rol y su organización le permitan hacerlo.

mod events;
mod storage;
mod types;

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, String, Vec};

pub use crate::types::{Batch, DataKey, Error, Farmer, Member, Role, Stage, StageRecord};

/// Largo máximo de un número de lote o de un `farmer_ref`.
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

    /// Asigna un rol de personal (todos menos `Farmer`) dentro de `org`.
    ///
    /// Una cuenta tiene un solo rol: asignar otro reemplaza el anterior.
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

    /// Quita el rol de la cuenta. Si era caficultor, libera también su
    /// `farmer_ref` para que se pueda vincular a otra wallet.
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

    /// Vincula la wallet de un caficultor con su ID de cooperativa.
    ///
    /// Lo firma el admin (el backend) después de que el bot validó el ID contra
    /// la lista de la cooperativa. Volver a llamarlo para la misma wallet y el
    /// mismo ID es inofensivo; un ID ya vinculado a otra wallet se rechaza.
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

    /// El caficultor firma el consentimiento GDPR/EUDR y sus declaraciones.
    ///
    /// `consent_hash` es el SHA-256 del texto aceptado y las declaraciones
    /// marcadas. Volver a firmar reemplaza el anterior (p. ej. una versión
    /// nueva del texto); el historial queda en los eventos.
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

    /// El Coffee Collector registra una entrega. El lote nace en `Received` y
    /// pertenece a la cooperativa del collector.
    ///
    /// No exige que el caficultor ya esté registrado on-chain: durante el
    /// piloto hay entregas de caficultores que todavía no terminaron el
    /// registro por el bot. El vínculo se resuelve por `farmer_ref`.
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

    /// Lleva un lote a la etapa siguiente.
    ///
    /// Valida que la transición sea válida (`Stage::can_follow`), que el rol del
    /// actor pueda mover el lote a esa etapa (`Stage::allows`) y que pertenezca
    /// a la cooperativa del lote. El Export Manager opera a nivel de unión, así
    /// que puede mover lotes de cualquier cooperativa.
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

    // ── administración ────────────────────────────────────────────────────

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
