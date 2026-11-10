use soroban_sdk::{contracterror, contracttype, Address, BytesN, String, Vec};

/// An account's role within the pilot.
///
/// The order matters: it is what the backend uses when serializing the role.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u32)]
pub enum Role {
    Farmer = 0,
    Collector = 1,
    CommitteeMember = 2,
    IndustryManager = 3,
    StoreKeeper = 4,
    ExportManager = 5,
}

/// A batch's stage. It always moves forward (see `Stage::can_follow`).
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
#[repr(u32)]
pub enum Stage {
    Received = 0,
    Washing = 1,
    Fermentation = 2,
    Drying = 3,
    Storage = 4,
    InTransportToUnion = 5,
    PreparedWithExportableBag = 6,
    Sold = 7,
}

impl Stage {
    /// `true` if `self` can come right after `previous`.
    ///
    /// The only stage that can be skipped is `Fermentation`: the pilot PDF
    /// names it in one list but not in the other, so it stays optional until
    /// Ethiopia confirms.
    pub fn can_follow(self, previous: Stage) -> bool {
        let next = previous as u32 + 1;
        self as u32 == next || (previous == Stage::Washing && self == Stage::Drying)
    }

    /// `true` if `role` can move a batch to this stage.
    pub fn allows(self, role: Role) -> bool {
        match self {
            Stage::Received => role == Role::Collector,
            Stage::Washing | Stage::Fermentation | Stage::Drying => role == Role::IndustryManager,
            Stage::Storage => role == Role::IndustryManager || role == Role::StoreKeeper,
            Stage::InTransportToUnion => role == Role::StoreKeeper,
            Stage::PreparedWithExportableBag | Stage::Sold => role == Role::ExportManager,
        }
    }
}

/// An account's role and the organization it belongs to.
///
/// `org` is the numeric ID assigned by the backend: a cooperative, or the union
/// for the Export Manager. The contract knows no names; it only compares.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Member {
    pub role: Role,
    pub org: u32,
}

/// Link between a farmer's wallet and their pseudonymous cooperative ID.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Farmer {
    pub farmer_ref: String,
    pub coop: u32,
    /// Hash (SHA-256) of the EUDR consent and declarations they signed.
    /// `None` until they sign.
    pub consent_hash: Option<BytesN<32>>,
    pub consent_at: u64,
}

/// An entry in a batch's history.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct StageRecord {
    pub stage: Stage,
    pub actor: Address,
    pub timestamp: u64,
    /// Hash (SHA-256) of the stage's full record, which lives off chain.
    pub data_hash: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Batch {
    /// Batch number, e.g. `22-10-2026 ID123`.
    pub id: String,
    /// The farmer's pseudonymous ID assigned by the cooperative.
    pub farmer_ref: String,
    pub coop: u32,
    pub collection_center: u32,
    /// Peso entregado, en gramos.
    pub weight_grams: u64,
    pub stage: Stage,
    pub history: Vec<StageRecord>,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Member(Address),
    Farmer(Address),
    /// `farmer_ref` → wallet, so the same ID cannot end up on two wallets.
    FarmerRef(String),
    Batch(String),
}

#[contracterror]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    /// The account has no role assigned.
    NotAMember = 2,
    /// The account's role does not allow this operation.
    Unauthorized = 3,
    /// The account belongs to a different cooperative than the batch.
    WrongOrganization = 4,
    /// Registering a farmer requires `register_farmer`.
    UseRegisterFarmer = 5,
    FarmerNotFound = 6,
    /// The `farmer_ref` is already linked to another wallet.
    FarmerRefTaken = 7,
    BatchAlreadyExists = 8,
    BatchNotFound = 9,
    /// The stage cannot follow the batch's current stage.
    InvalidTransition = 10,
    InvalidWeight = 11,
    /// Empty text or longer than `MAX_ID_LEN`.
    InvalidId = 12,
}
