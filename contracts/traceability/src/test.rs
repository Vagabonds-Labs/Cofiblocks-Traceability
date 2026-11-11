#![cfg(test)]
extern crate std;

use soroban_sdk::testutils::{Address as _, Events, Ledger, MockAuth, MockAuthInvoke};
use soroban_sdk::{Address, BytesN, Env, Event, IntoVal, String};

use crate::events::{BatchCreated, FarmerRegistered, ReceptionRecorded};
use crate::{Error, Role, Stage, Traceability, TraceabilityClient, MAX_DOCUMENTS};

const COOP_A: u32 = 1;
const COOP_B: u32 = 2;
const UNION: u32 = 100;
const CENTER: u32 = 11;
const FARMER: &str = "KK-ID123";

struct Setup<'a> {
    env: Env,
    admin: Address,
    agent: Address,
    contract_id: Address,
    client: TraceabilityClient<'a>,
}

impl<'a> Setup<'a> {
    /// Contract with an admin and a farmer agent, every auth mocked.
    fn new() -> Setup<'a> {
        let s = Self::without_agent();
        s.client.set_farmer_agent(&s.agent);
        s
    }

    fn without_agent() -> Setup<'a> {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(1_700_000_000);
        let admin = Address::generate(&env);
        let agent = Address::generate(&env);
        let contract_id = env.register(Traceability, (admin.clone(),));
        Setup {
            client: TraceabilityClient::new(&env, &contract_id),
            env,
            admin,
            agent,
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

    /// `FARMER`, registered with COOP_A.
    fn farmer(&self) -> String {
        let farmer_ref = self.s(FARMER);
        self.client.register_farmer(&farmer_ref, &COOP_A);
        farmer_ref
    }

    /// Batch delivered by `FARMER` (COOP_A).
    fn delivered_batch(&self, id: &str) -> String {
        let farmer_ref = self.farmer();
        let id = self.s(id);
        self.client.create_batch(&id, &farmer_ref, &CENTER, &self.hash(1));
        id
    }

    /// Batch delivered and then received by a COOP_A collector.
    fn received_batch(&self, id: &str) -> String {
        let id = self.delivered_batch(id);
        let collector = self.staff(Role::Collector, COOP_A);
        self.client
            .record_reception(&collector, &id, &45_000, &self.hash(2), &self.hash(3));
        id
    }

    /// Clears the mocked auths and authorizes only `signer` for this call.
    fn only<A: IntoVal<Env, soroban_sdk::Vec<soroban_sdk::Val>>>(
        &self,
        signer: &'a Address,
        fn_name: &'a str,
        args: A,
    ) -> TraceabilityClient<'a> {
        self.env.set_auths(&[]);
        let args = args.into_val(&self.env);
        let invoke = std::boxed::Box::leak(std::boxed::Box::new(MockAuthInvoke {
            contract: std::boxed::Box::leak(std::boxed::Box::new(self.contract_id.clone())),
            fn_name,
            args,
            sub_invokes: &[],
        }));
        let auths = std::boxed::Box::leak(std::boxed::Box::new([MockAuth {
            address: signer,
            invoke,
        }]));
        self.client.mock_auths(auths)
    }
}

// ══════════════════════════════════════════════════════════════════════════
// roles
// ══════════════════════════════════════════════════════════════════════════

#[test]
fn constructor_stores_the_admin() {
    let s = Setup::new();
    assert_eq!(s.client.get_admin(), s.admin);
}

#[test]
fn grants_replaces_and_revokes_roles() {
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
    assert_eq!(s.client.try_revoke_role(&account), Err(Ok(Error::NotAMember)));
}

/// Permission case: someone other than the admin assigns roles.
#[test]
fn only_the_admin_assigns_roles() {
    let s = Setup::new();
    let intruder = Address::generate(&s.env);
    let victim = Address::generate(&s.env);
    let result = s
        .only(&intruder, "grant_role", (victim.clone(), Role::ExportManager, UNION))
        .try_grant_role(&victim, &Role::ExportManager, &UNION);
    assert!(result.is_err());
    assert_eq!(s.client.get_member(&victim), None);
}

#[test]
fn the_farmer_agent_never_holds_a_staff_role() {
    let s = Setup::new();
    assert_eq!(
        s.client.try_grant_role(&s.agent, &Role::Collector, &COOP_A),
        Err(Ok(Error::Unauthorized))
    );

    let collector = s.staff(Role::Collector, COOP_A);
    assert_eq!(
        s.client.try_set_farmer_agent(&collector),
        Err(Ok(Error::Unauthorized))
    );
}

// ══════════════════════════════════════════════════════════════════════════
// farmer agent
// ══════════════════════════════════════════════════════════════════════════

#[test]
fn only_the_admin_sets_the_farmer_agent() {
    let s = Setup::new();
    let intruder = Address::generate(&s.env);
    let result = s
        .only(&intruder, "set_farmer_agent", (intruder.clone(),))
        .try_set_farmer_agent(&intruder);
    assert!(result.is_err());
    assert_eq!(s.client.get_farmer_agent(), Some(s.agent.clone()));
}

#[test]
fn farmer_actions_fail_until_the_agent_is_set() {
    let s = Setup::without_agent();
    assert_eq!(
        s.client.try_register_farmer(&s.s(FARMER), &COOP_A),
        Err(Ok(Error::FarmerAgentNotSet))
    );
}

/// Permission case: an arbitrary account creates a batch (or registers a farmer).
#[test]
fn farmer_actions_require_the_agent_signature() {
    let s = Setup::new();
    let farmer_ref = s.farmer();
    let intruder = Address::generate(&s.env);

    let result = s
        .only(&intruder, "register_farmer", (s.s("KK-ID999"), COOP_A))
        .try_register_farmer(&s.s("KK-ID999"), &COOP_A);
    assert!(result.is_err());

    let id = s.s("L1");
    let result = s
        .only(&intruder, "create_batch", (id.clone(), farmer_ref.clone(), CENTER, s.hash(1)))
        .try_create_batch(&id, &farmer_ref, &CENTER, &s.hash(1));
    assert!(result.is_err());
    assert_eq!(s.client.try_get_batch(&id), Err(Ok(Error::BatchNotFound)));

    // The agent itself can.
    s.only(&s.agent, "create_batch", (id.clone(), farmer_ref.clone(), CENTER, s.hash(1)))
        .create_batch(&id, &farmer_ref, &CENTER, &s.hash(1));
}

#[test]
fn replacing_the_agent_locks_out_the_old_one() {
    let s = Setup::new();
    let old_agent = s.agent.clone();
    let new_agent = Address::generate(&s.env);
    s.client.set_farmer_agent(&new_agent);

    let result = s
        .only(&old_agent, "register_farmer", (s.s(FARMER), COOP_A))
        .try_register_farmer(&s.s(FARMER), &COOP_A);
    assert!(result.is_err());
}

// ══════════════════════════════════════════════════════════════════════════
// farmers
// ══════════════════════════════════════════════════════════════════════════

#[test]
fn registers_the_farmer_their_consent_and_profile() {
    let s = Setup::new();
    let farmer_ref = s.s(FARMER);
    s.client.register_farmer(&farmer_ref, &COOP_A);

    let event = FarmerRegistered {
        farmer_ref: farmer_ref.clone(),
        coop: COOP_A,
    };
    let events = s.env.events().all().filter_by_contract(&s.contract_id);
    assert_eq!(events, [event.to_xdr(&s.env, &s.contract_id)]);

    s.client.record_consent(&farmer_ref, &s.hash(7));
    s.client.set_profile(&farmer_ref, &s.hash(8));
    s.client.set_profile(&farmer_ref, &s.hash(9));

    let farmer = s.client.get_farmer(&farmer_ref).unwrap();
    assert_eq!(farmer.coop, COOP_A);
    assert_eq!(farmer.consent_hash, Some(s.hash(7)));
    assert_eq!(farmer.consent_at, 1_700_000_000);
    // The profile is editable: the latest version wins.
    assert_eq!(farmer.profile_hash, Some(s.hash(9)));
}

#[test]
fn registering_again_is_harmless_but_another_coop_is_rejected() {
    let s = Setup::new();
    let farmer_ref = s.farmer();
    s.client.record_consent(&farmer_ref, &s.hash(7));

    s.client.register_farmer(&farmer_ref, &COOP_A);
    assert_eq!(
        s.client.get_farmer(&farmer_ref).unwrap().consent_hash,
        Some(s.hash(7))
    );

    assert_eq!(
        s.client.try_register_farmer(&farmer_ref, &COOP_B),
        Err(Ok(Error::FarmerRefTaken))
    );
}

#[test]
fn consent_and_profile_need_a_registered_farmer() {
    let s = Setup::new();
    let unknown = s.s("KK-NOPE");
    assert_eq!(
        s.client.try_record_consent(&unknown, &s.hash(1)),
        Err(Ok(Error::FarmerNotFound))
    );
    assert_eq!(
        s.client.try_set_profile(&unknown, &s.hash(1)),
        Err(Ok(Error::FarmerNotFound))
    );
}

#[test]
fn rejects_empty_or_too_long_ids() {
    let s = Setup::new();
    assert_eq!(
        s.client.try_register_farmer(&s.s(""), &COOP_A),
        Err(Ok(Error::InvalidId))
    );
    let long = "X".repeat(65);
    assert_eq!(
        s.client.try_register_farmer(&s.s(&long), &COOP_A),
        Err(Ok(Error::InvalidId))
    );

    let farmer_ref = s.farmer();
    assert_eq!(
        s.client.try_create_batch(&s.s(&long), &farmer_ref, &CENTER, &s.hash(1)),
        Err(Ok(Error::InvalidId))
    );
}

// ══════════════════════════════════════════════════════════════════════════
// deliveries and reception
// ══════════════════════════════════════════════════════════════════════════

#[test]
fn the_agent_creates_the_batch_in_delivered() {
    let s = Setup::new();
    let farmer_ref = s.farmer();
    let id = s.s("01-12-2026 KK-ID123");
    s.client.create_batch(&id, &farmer_ref, &CENTER, &s.hash(1));

    let event = BatchCreated {
        id: id.clone(),
        farmer_ref: farmer_ref.clone(),
        coop: COOP_A,
        collection_center: CENTER,
        data_hash: s.hash(1),
    };
    let events = s.env.events().all().filter_by_contract(&s.contract_id);
    assert_eq!(events, [event.to_xdr(&s.env, &s.contract_id)]);

    let batch = s.client.get_batch(&id);
    assert_eq!(batch.stage, Stage::Delivered);
    assert_eq!(batch.coop, COOP_A);
    assert_eq!(batch.weight_grams, 0);
    assert_eq!(batch.receipt_hash, None);
    assert_eq!(batch.history.len(), 1);
    let first = batch.history.get(0).unwrap();
    assert_eq!(first.actor, s.agent);
    assert_eq!(first.data_hash, s.hash(1));
}

/// Permission case: a batch is created with an ID that already exists.
#[test]
fn batches_need_a_registered_farmer_and_a_unique_id() {
    let s = Setup::new();
    assert_eq!(
        s.client.try_create_batch(&s.s("L1"), &s.s("KK-NOPE"), &CENTER, &s.hash(1)),
        Err(Ok(Error::FarmerNotFound))
    );

    let id = s.delivered_batch("L1");
    assert_eq!(
        s.client.try_create_batch(&id, &s.s(FARMER), &CENTER, &s.hash(9)),
        Err(Ok(Error::BatchAlreadyExists))
    );
    // The original delivery is untouched.
    assert_eq!(s.client.get_batch(&id).history.get(0).unwrap().data_hash, s.hash(1));
}

#[test]
fn the_collector_records_weight_and_receipt() {
    let s = Setup::new();
    let id = s.delivered_batch("L1");
    let collector = s.staff(Role::Collector, COOP_A);
    s.client
        .record_reception(&collector, &id, &45_000, &s.hash(2), &s.hash(3));

    let event = ReceptionRecorded {
        id: id.clone(),
        collector: collector.clone(),
        weight_grams: 45_000,
        receipt_hash: s.hash(2),
        data_hash: s.hash(3),
    };
    let events = s.env.events().all().filter_by_contract(&s.contract_id);
    assert_eq!(events, [event.to_xdr(&s.env, &s.contract_id)]);

    let batch = s.client.get_batch(&id);
    assert_eq!(batch.stage, Stage::Received);
    assert_eq!(batch.weight_grams, 45_000);
    assert_eq!(batch.receipt_hash, Some(s.hash(2)));
    assert_eq!(batch.history.len(), 2);
    assert_eq!(batch.history.get(1).unwrap().actor, collector);
}

/// Permission case: the weight is recorded twice.
#[test]
fn the_weight_is_recorded_only_once() {
    let s = Setup::new();
    let id = s.received_batch("L1");
    let collector = s.staff(Role::Collector, COOP_A);
    assert_eq!(
        s.client
            .try_record_reception(&collector, &id, &1, &s.hash(4), &s.hash(5)),
        Err(Ok(Error::ReceptionAlreadyRecorded))
    );
    assert_eq!(s.client.get_batch(&id).weight_grams, 45_000);
}

/// Permission cases: an arbitrary account records the weight, and a Collector
/// from another cooperative records the weight.
#[test]
fn only_the_batch_cooperative_collector_records_reception() {
    let s = Setup::new();
    let id = s.delivered_batch("L1");

    let stranger = Address::generate(&s.env);
    assert_eq!(
        s.client
            .try_record_reception(&stranger, &id, &45_000, &s.hash(2), &s.hash(3)),
        Err(Ok(Error::NotAMember))
    );

    let other_coop = s.staff(Role::Collector, COOP_B);
    assert_eq!(
        s.client
            .try_record_reception(&other_coop, &id, &45_000, &s.hash(2), &s.hash(3)),
        Err(Ok(Error::WrongOrganization))
    );

    let industry = s.staff(Role::IndustryManager, COOP_A);
    assert_eq!(
        s.client
            .try_record_reception(&industry, &id, &45_000, &s.hash(2), &s.hash(3)),
        Err(Ok(Error::Unauthorized))
    );

    let collector = s.staff(Role::Collector, COOP_A);
    assert_eq!(
        s.client
            .try_record_reception(&collector, &id, &0, &s.hash(2), &s.hash(3)),
        Err(Ok(Error::InvalidWeight))
    );
    assert_eq!(s.client.get_batch(&id).stage, Stage::Delivered);
}

#[test]
fn reception_requires_the_collector_signature() {
    let s = Setup::new();
    let id = s.delivered_batch("L1");
    let collector = s.staff(Role::Collector, COOP_A);
    let result = s
        .only(
            &s.admin,
            "record_reception",
            (collector.clone(), id.clone(), 45_000u64, s.hash(2), s.hash(3)),
        )
        .try_record_reception(&collector, &id, &45_000, &s.hash(2), &s.hash(3));
    assert!(result.is_err());
}

// ══════════════════════════════════════════════════════════════════════════
// stages
// ══════════════════════════════════════════════════════════════════════════

#[test]
fn full_journey_to_the_sale() {
    let s = Setup::new();
    let id = s.received_batch("L1");
    let industry = s.staff(Role::IndustryManager, COOP_A);
    let store = s.staff(Role::StoreKeeper, COOP_A);
    let export = s.staff(Role::ExportManager, UNION);

    let steps = [
        (Stage::Washing, &industry),
        (Stage::Fermentation, &industry),
        (Stage::Drying, &industry),
        (Stage::Storage, &store),
        (Stage::InTransportToUnion, &store),
        (Stage::PreparedWithExportableBag, &export),
        (Stage::Sold, &export),
    ];
    for (i, (stage, actor)) in steps.iter().enumerate() {
        s.client.advance_stage(actor, &id, stage, &s.hash(10 + i as u8));
    }

    let batch = s.client.get_batch(&id);
    assert_eq!(batch.stage, Stage::Sold);
    assert_eq!(batch.history.len(), 9);
    assert_eq!(batch.history.get(8).unwrap().actor, export);
}

/// Permission case: a stage goes backwards or skips ahead.
#[test]
fn fermentation_can_be_skipped_and_nothing_else() {
    let s = Setup::new();
    let id = s.received_batch("L1");
    let industry = s.staff(Role::IndustryManager, COOP_A);

    assert_eq!(
        s.client.try_advance_stage(&industry, &id, &Stage::Drying, &s.hash(4)),
        Err(Ok(Error::InvalidTransition))
    );
    s.client.advance_stage(&industry, &id, &Stage::Washing, &s.hash(4));
    // Washing → Drying skips Fermentation: allowed.
    s.client.advance_stage(&industry, &id, &Stage::Drying, &s.hash(5));

    // No going back and no repeating a stage.
    assert_eq!(
        s.client.try_advance_stage(&industry, &id, &Stage::Washing, &s.hash(6)),
        Err(Ok(Error::InvalidTransition))
    );
    assert_eq!(
        s.client.try_advance_stage(&industry, &id, &Stage::Drying, &s.hash(6)),
        Err(Ok(Error::InvalidTransition))
    );
}

#[test]
fn a_delivered_batch_must_be_received_first() {
    let s = Setup::new();
    let id = s.delivered_batch("L1");
    let industry = s.staff(Role::IndustryManager, COOP_A);
    assert_eq!(
        s.client.try_advance_stage(&industry, &id, &Stage::Washing, &s.hash(4)),
        Err(Ok(Error::InvalidTransition))
    );

    // `Received` is only reachable through `record_reception`.
    let collector = s.staff(Role::Collector, COOP_A);
    assert_eq!(
        s.client.try_advance_stage(&collector, &id, &Stage::Received, &s.hash(4)),
        Err(Ok(Error::Unauthorized))
    );
}

/// Permission case: a role moves a stage that is not theirs.
#[test]
fn each_stage_is_moved_by_its_role() {
    let s = Setup::new();
    let id = s.received_batch("L1");
    let store = s.staff(Role::StoreKeeper, COOP_A);
    let committee = s.staff(Role::CommitteeMember, COOP_A);
    let export = s.staff(Role::ExportManager, UNION);

    for actor in [&store, &committee, &export] {
        assert_eq!(
            s.client.try_advance_stage(actor, &id, &Stage::Washing, &s.hash(4)),
            Err(Ok(Error::Unauthorized))
        );
    }
}

#[test]
fn storage_can_be_set_by_the_industry_manager() {
    let s = Setup::new();
    let id = s.received_batch("L1");
    let industry = s.staff(Role::IndustryManager, COOP_A);
    s.client.advance_stage(&industry, &id, &Stage::Washing, &s.hash(4));
    s.client.advance_stage(&industry, &id, &Stage::Drying, &s.hash(5));
    s.client.advance_stage(&industry, &id, &Stage::Storage, &s.hash(6));
    assert_eq!(s.client.get_batch(&id).stage, Stage::Storage);
}

#[test]
fn staff_from_another_cooperative_cannot_move_the_batch() {
    let s = Setup::new();
    let id = s.received_batch("L1");
    let other = s.staff(Role::IndustryManager, COOP_B);
    assert_eq!(
        s.client.try_advance_stage(&other, &id, &Stage::Washing, &s.hash(4)),
        Err(Ok(Error::WrongOrganization))
    );
}

/// Permission case: the farmer agent does something reserved for staff.
#[test]
fn the_farmer_agent_cannot_act_as_staff() {
    let s = Setup::new();
    let id = s.delivered_batch("L1");
    assert_eq!(
        s.client
            .try_record_reception(&s.agent, &id, &45_000, &s.hash(2), &s.hash(3)),
        Err(Ok(Error::NotAMember))
    );
    assert_eq!(
        s.client.try_advance_stage(&s.agent, &id, &Stage::Washing, &s.hash(4)),
        Err(Ok(Error::NotAMember))
    );
    assert_eq!(
        s.client.try_attach_document(&s.agent, &id, &s.hash(5)),
        Err(Ok(Error::NotAMember))
    );
    let result = s
        .only(&s.agent, "grant_role", (s.agent.clone(), Role::Collector, COOP_A))
        .try_grant_role(&s.agent, &Role::Collector, &COOP_A);
    assert!(result.is_err());
}

#[test]
fn advancing_a_missing_batch_fails() {
    let s = Setup::new();
    let industry = s.staff(Role::IndustryManager, COOP_A);
    assert_eq!(
        s.client.try_advance_stage(&industry, &s.s("NOPE"), &Stage::Washing, &s.hash(4)),
        Err(Ok(Error::BatchNotFound))
    );
}

#[test]
fn advancing_requires_the_actor_signature() {
    let s = Setup::new();
    let id = s.received_batch("L1");
    let industry = s.staff(Role::IndustryManager, COOP_A);
    let result = s
        .only(
            &s.admin,
            "advance_stage",
            (industry.clone(), id.clone(), Stage::Washing, s.hash(4)),
        )
        .try_advance_stage(&industry, &id, &Stage::Washing, &s.hash(4));
    assert!(result.is_err());
}

// ══════════════════════════════════════════════════════════════════════════
// documents
// ══════════════════════════════════════════════════════════════════════════

#[test]
fn cooperative_roles_and_the_export_manager_attach_documents() {
    let s = Setup::new();
    let id = s.delivered_batch("L1");
    let committee = s.staff(Role::CommitteeMember, COOP_A);
    let export = s.staff(Role::ExportManager, UNION);

    s.client.attach_document(&committee, &id, &s.hash(20));
    s.client.attach_document(&export, &id, &s.hash(21));

    let batch = s.client.get_batch(&id);
    assert_eq!(batch.documents.len(), 2);
    // Attaching documents does not change the stage.
    assert_eq!(batch.stage, Stage::Delivered);
}

#[test]
fn documents_are_scoped_unique_and_bounded() {
    let s = Setup::new();
    let id = s.delivered_batch("L1");
    let other = s.staff(Role::StoreKeeper, COOP_B);
    assert_eq!(
        s.client.try_attach_document(&other, &id, &s.hash(20)),
        Err(Ok(Error::WrongOrganization))
    );

    let store = s.staff(Role::StoreKeeper, COOP_A);
    s.client.attach_document(&store, &id, &s.hash(20));
    assert_eq!(
        s.client.try_attach_document(&store, &id, &s.hash(20)),
        Err(Ok(Error::DocumentAlreadyAttached))
    );

    for byte in 1..MAX_DOCUMENTS as u8 {
        s.client.attach_document(&store, &id, &s.hash(100 + byte));
    }
    assert_eq!(
        s.client.try_attach_document(&store, &id, &s.hash(250)),
        Err(Ok(Error::TooManyDocuments))
    );
}
