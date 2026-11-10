use soroban_sdk::{contracterror, contracttype, Address, BytesN, String, Vec};

/// Rol de una cuenta dentro del piloto.
///
/// El orden importa: es el que usa el backend al serializar el rol.
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

/// Etapa de un lote. Avanza siempre hacia adelante (ver `Stage::can_follow`).
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
    /// `true` si `self` puede venir inmediatamente después de `previous`.
    ///
    /// La única etapa que se puede saltear es `Fermentation`: el PDF del piloto
    /// la nombra en una lista y no en la otra, así que queda opcional hasta que
    /// Etiopía confirme.
    pub fn can_follow(self, previous: Stage) -> bool {
        let next = previous as u32 + 1;
        self as u32 == next || (previous == Stage::Washing && self == Stage::Drying)
    }

    /// `true` si `role` puede llevar un lote a esta etapa.
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

/// Rol de una cuenta y la organización a la que pertenece.
///
/// `org` es el id numérico que asigna el backend: una cooperativa, o la unión
/// en el caso del Export Manager. El contrato no conoce nombres; sólo compara.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Member {
    pub role: Role,
    pub org: u32,
}

/// Vínculo entre la wallet de un caficultor y su ID seudónimo de cooperativa.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Farmer {
    pub farmer_ref: String,
    pub coop: u32,
    /// Hash (SHA-256) del consentimiento y las declaraciones EUDR que firmó.
    /// `None` hasta que firma.
    pub consent_hash: Option<BytesN<32>>,
    pub consent_at: u64,
}

/// Una entrada del historial de un lote.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct StageRecord {
    pub stage: Stage,
    pub actor: Address,
    pub timestamp: u64,
    /// Hash (SHA-256) del registro completo de la etapa, que vive off-chain.
    pub data_hash: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Batch {
    /// Número de lote, p. ej. `22-10-2026 ID123`.
    pub id: String,
    /// ID seudónimo del caficultor asignado por la cooperativa.
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
    /// `farmer_ref` → wallet, para que un mismo ID no quede en dos wallets.
    FarmerRef(String),
    Batch(String),
}

#[contracterror]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    /// La cuenta no tiene rol asignado.
    NotAMember = 2,
    /// El rol de la cuenta no permite esta operación.
    Unauthorized = 3,
    /// La cuenta pertenece a otra cooperativa que la del lote.
    WrongOrganization = 4,
    /// Para registrar un caficultor hay que usar `register_farmer`.
    UseRegisterFarmer = 5,
    FarmerNotFound = 6,
    /// El `farmer_ref` ya está vinculado a otra wallet.
    FarmerRefTaken = 7,
    BatchAlreadyExists = 8,
    BatchNotFound = 9,
    /// La etapa no puede seguir a la etapa actual del lote.
    InvalidTransition = 10,
    InvalidWeight = 11,
    /// Texto vacío o más largo que `MAX_ID_LEN`.
    InvalidId = 12,
}
