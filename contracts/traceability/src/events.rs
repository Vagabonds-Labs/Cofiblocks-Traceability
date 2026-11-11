//! Events of the traceability contract.
//!
//! The backend indexes them to build each batch's timeline and to send
//! notifications to farmers. With `#[contractevent]` the data section is a map
//! keyed by field name.

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

/// topics: `["farmer_agent_set", agent]`
#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct FarmerAgentSet {
    #[topic]
    pub agent: Address,
}

/// topics: `["farmer_registered", farmer_ref]`
#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct FarmerRegistered {
    #[topic]
    pub farmer_ref: String,
    pub coop: u32,
}

/// topics: `["consent_recorded", farmer_ref]`
#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct ConsentRecorded {
    #[topic]
    pub farmer_ref: String,
    pub consent_hash: BytesN<32>,
}

/// topics: `["profile_updated", farmer_ref]`
#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct ProfileUpdated {
    #[topic]
    pub farmer_ref: String,
    pub profile_hash: BytesN<32>,
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
    pub data_hash: BytesN<32>,
}

/// topics: `["reception_recorded", id]`
#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct ReceptionRecorded {
    #[topic]
    pub id: String,
    pub collector: Address,
    pub weight_grams: u64,
    pub receipt_hash: BytesN<32>,
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

/// topics: `["document_attached", id]`
#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct DocumentAttached {
    #[topic]
    pub id: String,
    pub actor: Address,
    pub doc_hash: BytesN<32>,
}
