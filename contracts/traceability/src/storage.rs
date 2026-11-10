//! Acceso a storage con extensión de TTL.
//!
//! Soroban archiva las entradas que nadie toca. Un lote vendido puede pasar
//! meses sin movimiento y tiene que seguir siendo verificable, así que **toda**
//! lectura y escritura pasa por acá y extiende el TTL.

use soroban_sdk::{Address, Env, String};

use crate::types::{Batch, DataKey, Error, Farmer, Member};

/// Un ledger cada ~5 s.
const DAY_IN_LEDGERS: u32 = 17_280;

/// Extender a 150 días. Mainnet permite hasta ~180.
const BUMP: u32 = 150 * DAY_IN_LEDGERS;
/// Extender recién cuando quedan menos de 30 días.
const THRESHOLD: u32 = 30 * DAY_IN_LEDGERS;

pub fn extend_instance(env: &Env) {
    env.storage().instance().extend_ttl(THRESHOLD, BUMP);
}

fn get_persistent<T: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>>(
    env: &Env,
    key: &DataKey,
) -> Option<T> {
    let value = env.storage().persistent().get(key);
    if value.is_some() {
        env.storage().persistent().extend_ttl(key, THRESHOLD, BUMP);
    }
    value
}

fn set_persistent<T: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(
    env: &Env,
    key: &DataKey,
    value: &T,
) {
    env.storage().persistent().set(key, value);
    env.storage().persistent().extend_ttl(key, THRESHOLD, BUMP);
}

// ── configuración (instance) ──────────────────────────────────────────────

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

pub fn get_admin(env: &Env) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(Error::NotInitialized)
}

// ── miembros ──────────────────────────────────────────────────────────────

pub fn get_member(env: &Env, account: &Address) -> Option<Member> {
    get_persistent(env, &DataKey::Member(account.clone()))
}

pub fn set_member(env: &Env, account: &Address, member: &Member) {
    set_persistent(env, &DataKey::Member(account.clone()), member);
}

pub fn remove_member(env: &Env, account: &Address) {
    env.storage()
        .persistent()
        .remove(&DataKey::Member(account.clone()));
}

// ── caficultores ──────────────────────────────────────────────────────────

pub fn get_farmer(env: &Env, account: &Address) -> Option<Farmer> {
    get_persistent(env, &DataKey::Farmer(account.clone()))
}

pub fn set_farmer(env: &Env, account: &Address, farmer: &Farmer) {
    set_persistent(env, &DataKey::Farmer(account.clone()), farmer);
}

pub fn remove_farmer(env: &Env, account: &Address, farmer_ref: &String) {
    env.storage()
        .persistent()
        .remove(&DataKey::Farmer(account.clone()));
    env.storage()
        .persistent()
        .remove(&DataKey::FarmerRef(farmer_ref.clone()));
}

pub fn get_farmer_by_ref(env: &Env, farmer_ref: &String) -> Option<Address> {
    get_persistent(env, &DataKey::FarmerRef(farmer_ref.clone()))
}

pub fn set_farmer_ref(env: &Env, farmer_ref: &String, account: &Address) {
    set_persistent(env, &DataKey::FarmerRef(farmer_ref.clone()), account);
}

// ── lotes ─────────────────────────────────────────────────────────────────

pub fn has_batch(env: &Env, id: &String) -> bool {
    env.storage().persistent().has(&DataKey::Batch(id.clone()))
}

pub fn get_batch(env: &Env, id: &String) -> Result<Batch, Error> {
    get_persistent(env, &DataKey::Batch(id.clone())).ok_or(Error::BatchNotFound)
}

pub fn set_batch(env: &Env, batch: &Batch) {
    set_persistent(env, &DataKey::Batch(batch.id.clone()), batch);
}
