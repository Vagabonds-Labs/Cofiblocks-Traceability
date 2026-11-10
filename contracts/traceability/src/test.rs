#![cfg(test)]
extern crate std;

use soroban_sdk::testutils::{Address as _, Events, Ledger, MockAuth, MockAuthInvoke};
use soroban_sdk::{Address, BytesN, Env, Event, IntoVal, String};

use crate::events::{BatchCreated, StageAdvanced};
use crate::{Error, Role, Stage, Traceability, TraceabilityClient};

const COOP_A: u32 = 1;
const COOP_B: u32 = 2;
const UNION: u32 = 100;
const CENTER: u32 = 11;

struct Setup<'a> {
    env: Env,
    admin: Address,
    contract_id: Address,
    client: TraceabilityClient<'a>,
}

impl<'a> Setup<'a> {
    fn new() -> Setup<'a> {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(1_700_000_000);
        let admin = Address::generate(&env);
        let contract_id = env.register(Traceability, (admin.clone(),));
        Setup {
            client: TraceabilityClient::new(&env, &contract_id),
            env,
            admin,
            contract_id,
        }
    }

    fn staff(&self, role: Role, org: u32) -> Address {
        let account = Address::generate(&self.env);
        self.client.grant_role(&account, &role, &org);
        account
    }

    fn s(&self, value: &str) -> String {
        String::from_str(&self.env, value)
    }

    fn hash(&self, byte: u8) -> BytesN<32> {
        BytesN::from_array(&self.env, &[byte; 32])
    }

    /// Batch received at COOP_A by a COOP_A collector.
    fn received_batch(&self, id: &str) -> String {
        let collector = self.staff(Role::Collector, COOP_A);
        let id = self.s(id);
        self.client.create_batch(
            &collector,
            &id,
            &self.s("ID123"),
            &CENTER,
            &45_000,
            &self.hash(1),
        );
        id
    }
}

// ══════════════════════════════════════════════════════════════════════════
// roles
// ══════════════════════════════════════════════════════════════════════════

#[test]
fn constructor_guarda_el_admin() {
    let s = Setup::new();
    assert_eq!(s.client.get_admin(), s.admin);
}

#[test]
fn asigna_reemplaza_y_revoca_roles() {
    let s = Setup::new();
    let account = s.staff(Role::Collector, COOP_A);
    let member = s.client.get_member(&account).unwrap();
    assert_eq!(member.role, Role::Collector);
    assert_eq!(member.org, COOP_A);

    s.client.grant_role(&account, &Role::StoreKeeper, &COOP_B);
    let member = s.client.get_member(&account).unwrap();
    assert_eq!(member.role, Role::StoreKeeper);
    assert_eq!(member.org, COOP_B);

    s.client.revoke_role(&account);
    assert_eq!(s.client.get_member(&account), None);
}

#[test]
fn el_rol_farmer_solo_se_asigna_con_register_farmer() {
    let s = Setup::new();
    let account = Address::generate(&s.env);
    let result = s.client.try_grant_role(&account, &Role::Farmer, &COOP_A);
    assert_eq!(result, Err(Ok(Error::UseRegisterFarmer)));
}

#[test]
fn asignar_rol_exige_autorizacion_del_admin() {
    let s = Setup::new();
    let intruso = Address::generate(&s.env);
    let victima = Address::generate(&s.env);

    s.env.set_auths(&[]);
    let result = s
        .client
        .mock_auths(&[MockAuth {
            address: &intruso,
            invoke: &MockAuthInvoke {
                contract: &s.contract_id,
                fn_name: "grant_role",
                args: (victima.clone(), Role::ExportManager, UNION).into_val(&s.env),
                sub_invokes: &[],
            },
        }])
        .try_grant_role(&victima, &Role::ExportManager, &UNION);
    assert!(result.is_err());
}

// ══════════════════════════════════════════════════════════════════════════
// caficultores
// ══════════════════════════════════════════════════════════════════════════

#[test]
fn registra_al_caficultor_y_su_consentimiento() {
    let s = Setup::new();
    let farmer = Address::generate(&s.env);
    s.client.register_farmer(&farmer, &s.s("ID123"), &COOP_A);

    let record = s.client.get_farmer(&farmer).unwrap();
    assert_eq!(record.farmer_ref, s.s("ID123"));
    assert_eq!(record.coop, COOP_A);
    assert_eq!(record.consent_hash, None);
    assert_eq!(s.client.get_farmer_by_ref(&s.s("ID123")), Some(farmer.clone()));
    assert_eq!(s.client.get_member(&farmer).unwrap().role, Role::Farmer);

    s.client.record_consent(&farmer, &s.hash(9));
    let record = s.client.get_farmer(&farmer).unwrap();
    assert_eq!(record.consent_hash, Some(s.hash(9)));
    assert_eq!(record.consent_at, 1_700_000_000);
}

#[test]
fn el_consentimiento_lo_firma_el_caficultor() {
    let s = Setup::new();
    let farmer = Address::generate(&s.env);
    s.client.register_farmer(&farmer, &s.s("ID123"), &COOP_A);

    s.env.set_auths(&[]);
    let result = s
        .client
        .mock_auths(&[MockAuth {
            address: &s.admin,
            invoke: &MockAuthInvoke {
                contract: &s.contract_id,
                fn_name: "record_consent",
                args: (farmer.clone(), s.hash(9)).into_val(&s.env),
                sub_invokes: &[],
            },
        }])
        .try_record_consent(&farmer, &s.hash(9));
    assert!(result.is_err());
}

#[test]
fn consentimiento_de_quien_no_es_caficultor_falla() {
    let s = Setup::new();
    let nadie = Address::generate(&s.env);
    let result = s.client.try_record_consent(&nadie, &s.hash(9));
    assert_eq!(result, Err(Ok(Error::FarmerNotFound)));
}

#[test]
fn un_farmer_ref_no_puede_quedar_en_dos_wallets() {
    let s = Setup::new();
    let primera = Address::generate(&s.env);
    let segunda = Address::generate(&s.env);
    s.client.register_farmer(&primera, &s.s("ID123"), &COOP_A);

    let result = s.client.try_register_farmer(&segunda, &s.s("ID123"), &COOP_A);
    assert_eq!(result, Err(Ok(Error::FarmerRefTaken)));

    // Re-registering the same wallet with the same ID is harmless.
    s.client.register_farmer(&primera, &s.s("ID123"), &COOP_A);

    // After revoking, the ID is free for another wallet.
    s.client.revoke_role(&primera);
    assert_eq!(s.client.get_farmer_by_ref(&s.s("ID123")), None);
    s.client.register_farmer(&segunda, &s.s("ID123"), &COOP_A);
    assert_eq!(s.client.get_farmer_by_ref(&s.s("ID123")), Some(segunda));
}

#[test]
fn cambiar_el_farmer_ref_de_una_wallet_libera_el_anterior() {
    let s = Setup::new();
    let farmer = Address::generate(&s.env);
    s.client.register_farmer(&farmer, &s.s("ID123"), &COOP_A);
    s.client.register_farmer(&farmer, &s.s("ID456"), &COOP_A);

    assert_eq!(s.client.get_farmer_by_ref(&s.s("ID123")), None);
    assert_eq!(s.client.get_farmer_by_ref(&s.s("ID456")), Some(farmer));
}

#[test]
fn rechaza_ids_vacios_o_demasiado_largos() {
    let s = Setup::new();
    let farmer = Address::generate(&s.env);
    assert_eq!(
        s.client.try_register_farmer(&farmer, &s.s(""), &COOP_A),
        Err(Ok(Error::InvalidId))
    );
    let largo = "x".repeat(65);
    assert_eq!(
        s.client.try_register_farmer(&farmer, &s.s(&largo), &COOP_A),
        Err(Ok(Error::InvalidId))
    );
}

// ══════════════════════════════════════════════════════════════════════════
// lotes
// ══════════════════════════════════════════════════════════════════════════

#[test]
fn el_collector_crea_el_lote_en_received() {
    let s = Setup::new();
    let collector = s.staff(Role::Collector, COOP_A);
    let id = s.s("22-10-2026 ID123");
    s.client
        .create_batch(&collector, &id, &s.s("ID123"), &CENTER, &45_000, &s.hash(1));

    // `events().all()` only returns the last invocation's events: check before reading.
    let event = BatchCreated {
        id: id.clone(),
        farmer_ref: s.s("ID123"),
        coop: COOP_A,
        collection_center: CENTER,
        weight_grams: 45_000,
        actor: collector.clone(),
        data_hash: s.hash(1),
    };
    let events = s.env.events().all().filter_by_contract(&s.contract_id);
    assert_eq!(events, [event.to_xdr(&s.env, &s.contract_id)]);

    let batch = s.client.get_batch(&id);
    assert_eq!(batch.stage, Stage::Received);
    assert_eq!(batch.coop, COOP_A);
    assert_eq!(batch.collection_center, CENTER);
    assert_eq!(batch.weight_grams, 45_000);
    assert_eq!(batch.history.len(), 1);
    let first = batch.history.get(0).unwrap();
    assert_eq!(first.actor, collector);
    assert_eq!(first.data_hash, s.hash(1));
    assert_eq!(first.timestamp, 1_700_000_000);
}

#[test]
fn solo_el_collector_crea_lotes() {
    let s = Setup::new();
    for role in [
        Role::CommitteeMember,
        Role::IndustryManager,
        Role::StoreKeeper,
        Role::ExportManager,
    ] {
        let actor = s.staff(role, COOP_A);
        let result = s.client.try_create_batch(
            &actor,
            &s.s("L1"),
            &s.s("ID123"),
            &CENTER,
            &1_000,
            &s.hash(1),
        );
        assert_eq!(result, Err(Ok(Error::Unauthorized)));
    }

    let sin_rol = Address::generate(&s.env);
    let result =
        s.client
            .try_create_batch(&sin_rol, &s.s("L1"), &s.s("ID123"), &CENTER, &1_000, &s.hash(1));
    assert_eq!(result, Err(Ok(Error::NotAMember)));
}

#[test]
fn no_se_repite_el_numero_de_lote_ni_se_aceptan_cero_gramos() {
    let s = Setup::new();
    let id = s.received_batch("L1");
    let collector = s.staff(Role::Collector, COOP_A);
    let repetido =
        s.client
            .try_create_batch(&collector, &id, &s.s("ID123"), &CENTER, &1_000, &s.hash(1));
    assert_eq!(repetido, Err(Ok(Error::BatchAlreadyExists)));

    let cero =
        s.client
            .try_create_batch(&collector, &s.s("L2"), &s.s("ID123"), &CENTER, &0, &s.hash(1));
    assert_eq!(cero, Err(Ok(Error::InvalidWeight)));
}

#[test]
fn recorrido_completo_hasta_la_venta() {
    let s = Setup::new();
    let id = s.received_batch("L1");
    let industry = s.staff(Role::IndustryManager, COOP_A);
    let store = s.staff(Role::StoreKeeper, COOP_A);
    let export = s.staff(Role::ExportManager, UNION);

    let pasos = [
        (&industry, Stage::Washing),
        (&industry, Stage::Fermentation),
        (&industry, Stage::Drying),
        (&store, Stage::Storage),
        (&store, Stage::InTransportToUnion),
        (&export, Stage::PreparedWithExportableBag),
        (&export, Stage::Sold),
    ];
    for (i, (actor, stage)) in pasos.iter().enumerate() {
        s.client
            .advance_stage(actor, &id, stage, &s.hash(10 + i as u8));
    }

    let last_event = StageAdvanced {
        id: id.clone(),
        stage: Stage::Sold,
        actor: export.clone(),
        data_hash: s.hash(16),
    };
    let events = s.env.events().all().filter_by_contract(&s.contract_id);
    assert_eq!(events, [last_event.to_xdr(&s.env, &s.contract_id)]);

    let batch = s.client.get_batch(&id);
    assert_eq!(batch.stage, Stage::Sold);
    assert_eq!(batch.history.len(), 8);
    let last = batch.history.get(7).unwrap();
    assert_eq!(last.stage, Stage::Sold);
    assert_eq!(last.actor, export);
}

#[test]
fn fermentation_se_puede_saltear_y_nada_mas() {
    let s = Setup::new();
    let id = s.received_batch("L1");
    let industry = s.staff(Role::IndustryManager, COOP_A);

    // Received → Drying salta Washing: no.
    let result = s
        .client
        .try_advance_stage(&industry, &id, &Stage::Drying, &s.hash(2));
    assert_eq!(result, Err(Ok(Error::InvalidTransition)));

    s.client
        .advance_stage(&industry, &id, &Stage::Washing, &s.hash(2));
    // Washing → Drying skips Fermentation: allowed.
    s.client
        .advance_stage(&industry, &id, &Stage::Drying, &s.hash(3));

    // No going back and no repeating a stage.
    for stage in [Stage::Washing, Stage::Fermentation, Stage::Drying] {
        let result = s.client.try_advance_stage(&industry, &id, &stage, &s.hash(4));
        assert_eq!(result, Err(Ok(Error::InvalidTransition)));
    }
}

#[test]
fn cada_etapa_la_mueve_su_rol() {
    let s = Setup::new();
    let id = s.received_batch("L1");
    let collector = s.staff(Role::Collector, COOP_A);
    let committee = s.staff(Role::CommitteeMember, COOP_A);
    let store = s.staff(Role::StoreKeeper, COOP_A);
    let export = s.staff(Role::ExportManager, UNION);

    for actor in [&collector, &committee, &store, &export] {
        let result = s
            .client
            .try_advance_stage(actor, &id, &Stage::Washing, &s.hash(2));
        assert_eq!(result, Err(Ok(Error::Unauthorized)));
    }

    // A farmer cannot move batches either.
    let farmer = Address::generate(&s.env);
    s.client.register_farmer(&farmer, &s.s("ID123"), &COOP_A);
    let result = s
        .client
        .try_advance_stage(&farmer, &id, &Stage::Washing, &s.hash(2));
    assert_eq!(result, Err(Ok(Error::Unauthorized)));
}

#[test]
fn storage_lo_puede_marcar_el_industry_manager() {
    let s = Setup::new();
    let id = s.received_batch("L1");
    let industry = s.staff(Role::IndustryManager, COOP_A);
    s.client
        .advance_stage(&industry, &id, &Stage::Washing, &s.hash(2));
    s.client
        .advance_stage(&industry, &id, &Stage::Drying, &s.hash(3));
    s.client
        .advance_stage(&industry, &id, &Stage::Storage, &s.hash(4));
    assert_eq!(s.client.get_batch(&id).stage, Stage::Storage);
}

#[test]
fn el_personal_de_otra_cooperativa_no_mueve_el_lote() {
    let s = Setup::new();
    let id = s.received_batch("L1");
    let industry_b = s.staff(Role::IndustryManager, COOP_B);
    let result = s
        .client
        .try_advance_stage(&industry_b, &id, &Stage::Washing, &s.hash(2));
    assert_eq!(result, Err(Ok(Error::WrongOrganization)));
}

#[test]
fn avanzar_un_lote_inexistente_falla() {
    let s = Setup::new();
    let industry = s.staff(Role::IndustryManager, COOP_A);
    let result = s
        .client
        .try_advance_stage(&industry, &s.s("no-existe"), &Stage::Washing, &s.hash(2));
    assert_eq!(result, Err(Ok(Error::BatchNotFound)));
}

#[test]
fn avanzar_exige_la_firma_del_actor() {
    let s = Setup::new();
    let id = s.received_batch("L1");
    let industry = s.staff(Role::IndustryManager, COOP_A);

    s.env.set_auths(&[]);
    let result = s
        .client
        .mock_auths(&[MockAuth {
            address: &s.admin,
            invoke: &MockAuthInvoke {
                contract: &s.contract_id,
                fn_name: "advance_stage",
                args: (industry.clone(), id.clone(), Stage::Washing, s.hash(2)).into_val(&s.env),
                sub_invokes: &[],
            },
        }])
        .try_advance_stage(&industry, &id, &Stage::Washing, &s.hash(2));
    assert!(result.is_err());
}
