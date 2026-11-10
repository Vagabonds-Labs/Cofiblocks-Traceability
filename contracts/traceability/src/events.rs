//! Eventos del contrato de trazabilidad.
//!
//! El backend los indexa para armar la línea de tiempo de cada lote y para
//! mandar los avisos del bot. Con `#[contractevent]` la sección de datos es un
//! mapa indexado por nombre de campo.

use soroban_sdk::{contractevent, Address, BytesN, String};

use crate::types::{Role, Stage};

/// topics: `["role_granted", account]`
#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct RoleGranted {
    #[topic]
    pub account: Address,
    pub role: Role,
    pub org: u32,
}

/// topics: `["role_revoked", account]`
#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct RoleRevoked {
    #[topic]
    pub account: Address,
}

/// topics: `["farmer_registered", account]`
#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct FarmerRegistered {
    #[topic]
    pub account: Address,
    pub farmer_ref: String,
    pub coop: u32,
}

/// topics: `["consent_recorded", account]`
#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct ConsentRecorded {
    #[topic]
    pub account: Address,
    pub consent_hash: BytesN<32>,
}

/// topics: `["batch_created", id]`
#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct BatchCreated {
    #[topic]
    pub id: String,
    pub farmer_ref: String,
    pub coop: u32,
    pub collection_center: u32,
    pub weight_grams: u64,
    pub actor: Address,
    pub data_hash: BytesN<32>,
}

/// topics: `["stage_advanced", id]`
#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct StageAdvanced {
    #[topic]
    pub id: String,
    pub stage: Stage,
    pub actor: Address,
    pub data_hash: BytesN<32>,
}
