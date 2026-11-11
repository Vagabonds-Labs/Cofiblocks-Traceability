use soroban_sdk::{contracterror, contracttype, Address, BytesN, String, Vec};

/// A staff account's role within the pilot.
///
/// Farmers are not staff: they have no account and act through the farmer
/// agent. The order matters: it is what the backend uses when serializing the
/// role.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u32)]
pub enum Role {
    Collector = 0,
    CommitteeMember = 1,
    IndustryManager = 2,
    StoreKeeper = 3,
    ExportManager = 4,
}

/// A batch's stage. It always moves forward (see `Stage::can_follow`).
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
#[repr(u32)]
pub enum Stage {
    /// The farmer recorded the delivery (through the farmer agent).
    Delivered = 0,
    /// The Collector recorded the weight and the receipt.
    Received = 1,
    Washing = 2,
    Fermentation = 3,
    Drying = 4,
    Storage = 5,
    InTransportToUnion = 6,
    PreparedWithExportableBag = 7,
    Sold = 8,
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

    /// `true` if `role` can move a batch to this stage with `advance_stage`.
    ///
    /// `Delivered` and `Received` are never reached with `advance_stage`: the
    /// farmer agent creates the batch in `Delivered`, and `record_reception`
    /// moves it to `Received`.
    pub fn allows(self, role: Role) -> bool {
        match self {
            Stage::Delivered | Stage::Received => false,
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

/// A farmer, identified only by the pseudonymous ID their cooperative gave
/// them. There is no wallet: the farmer agent acts for them.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Farmer {
    pub farmer_ref: String,
    pub coop: u32,
    /// Hash (SHA-256) of the EUDR consent and declarations they accepted.
    /// `None` until they accept.
    pub consent_hash: Option<BytesN<32>>,
    pub consent_at: u64,
    /// Hash (SHA-256) of the latest version of their farm profile and
    /// practices. Every version is also in a `profile_updated` event.
    pub profile_hash: Option<BytesN<32>>,
    pub profile_at: u64,
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
    /// Batch number, e.g. `22-10-2026 KK-ID123`.
    pub id: String,
    /// The farmer's pseudonymous ID assigned by the cooperative.
    pub farmer_ref: String,
    pub coop: u32,
    pub collection_center: u32,
    /// Weight recorded by the Collector, in grams. 0 until reception.
    pub weight_grams: u64,
    /// Hash (SHA-256) of the receipt photo. `None` until reception.
    pub receipt_hash: Option<BytesN<32>>,
    pub stage: Stage,
    pub history: Vec<StageRecord>,
    /// Hashes (SHA-256) of the attached documents, at most `MAX_DOCUMENTS`.
    pub documents: Vec<BytesN<32>>,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    /// The backend account that signs every farmer action.
    FarmerAgent,
    Member(Address),
    Farmer(String),
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
    /// The admin has not set the farmer agent yet.
    FarmerAgentNotSet = 5,
    FarmerNotFound = 6,
    /// The `farmer_ref` is already registered with another cooperative.
    FarmerRefTaken = 7,
    BatchAlreadyExists = 8,
    BatchNotFound = 9,
    /// The stage cannot follow the batch's current stage.
    InvalidTransition = 10,
    InvalidWeight = 11,
    /// Empty text or longer than `MAX_ID_LEN`.
    InvalidId = 12,
    /// The weight and receipt were already recorded for this batch.
    ReceptionAlreadyRecorded = 13,
    /// The batch already has `MAX_DOCUMENTS` documents.
    TooManyDocuments = 14,
    DocumentAlreadyAttached = 15,
}
