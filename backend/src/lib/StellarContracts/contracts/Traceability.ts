import { scValToNative, Transaction, xdr } from '@stellar/stellar-sdk';

import { getContractAddress } from '../deployments';
import { StellarClient } from '../StellarClient';
import { TxBuilder } from '../TxBuilder';
import {
	OnChainBatch,
	OnChainFarmer,
	OnChainMember,
	ROLE_BY_DISCRIMINANT,
	ROLES,
	STAGE_BY_DISCRIMINANT,
	STAGES,
	StellarContract,
} from '../types/contracts';
import { PreparedTransaction } from '../types/transactions';
import { bytesToHex } from '../utils/formatting';
import {
	addressVal,
	bytes32Val,
	roleVal,
	stageVal,
	stringVal,
	u32Val,
	u64Val,
} from '../utils/scval';

/**
 * Wrapper for the `traceability` contract (v1).
 *
 * - Admin writes (roles, farmer agent) return a `Transaction` signed by the
 *   backend admin, ready for `TxSubmitter.submitAsService`.
 * - Farmer writes (registration, consent, profile, deliveries) return a
 *   `Transaction` signed by the farmer agent, ready for
 *   `TxSubmitter.submitSigned`, which adds the admin's fee-bump.
 * - Staff writes (reception, stages, documents) return a `PreparedTransaction`
 *   with the staff member as the source account, for their wallet to sign and
 *   the backend to submit with fee-bump.
 */
export class Traceability {
	public readonly contractAddress: string;

	private readonly builder: TxBuilder;

	constructor(private readonly client: StellarClient) {
		this.contractAddress = getContractAddress(client.network, StellarContract.TRACEABILITY);
		this.builder = new TxBuilder(client);
	}

	private call(method: string, args: xdr.ScVal[] = []) {
		return { contractId: this.contractAddress, method, args, kind: 'traceability' as const };
	}

	private asFarmerAgent(method: string, args: xdr.ScVal[]): Promise<Transaction> {
		return this.builder.prepareSignedBy(this.client.getFarmerAgentKeypair(), this.call(method, args));
	}

	// ── admin ───────────────────────────────────────────────────────────────

	public grantRole(account: string, role: ROLES, org: number): Promise<Transaction> {
		return this.builder.prepareAsService(
			this.call('grant_role', [addressVal(account), roleVal(role), u32Val(org)])
		);
	}

	public revokeRole(account: string): Promise<Transaction> {
		return this.builder.prepareAsService(this.call('revoke_role', [addressVal(account)]));
	}

	public setFarmerAgent(agent: string): Promise<Transaction> {
		return this.builder.prepareAsService(this.call('set_farmer_agent', [addressVal(agent)]));
	}

	// ── farmers (signed by the farmer agent) ────────────────────────────────

	public registerFarmer(farmerRef: string, coop: number): Promise<Transaction> {
		return this.asFarmerAgent('register_farmer', [stringVal(farmerRef), u32Val(coop)]);
	}

	public recordConsent(farmerRef: string, consentHashHex: string): Promise<Transaction> {
		return this.asFarmerAgent('record_consent', [stringVal(farmerRef), bytes32Val(consentHashHex)]);
	}

	public setProfile(farmerRef: string, profileHashHex: string): Promise<Transaction> {
		return this.asFarmerAgent('set_profile', [stringVal(farmerRef), bytes32Val(profileHashHex)]);
	}

	public createBatch(
		id: string,
		farmerRef: string,
		collectionCenter: number,
		dataHashHex: string
	): Promise<Transaction> {
		return this.asFarmerAgent('create_batch', [
			stringVal(id),
			stringVal(farmerRef),
			u32Val(collectionCenter),
			bytes32Val(dataHashHex),
		]);
	}

	// ── staff (signed by their own wallet) ──────────────────────────────────

	public recordReception(
		collector: string,
		id: string,
		weightGrams: bigint | number,
		receiptHashHex: string,
		dataHashHex: string
	): Promise<PreparedTransaction> {
		return this.builder.prepare(
			collector,
			this.call('record_reception', [
				addressVal(collector),
				stringVal(id),
				u64Val(weightGrams),
				bytes32Val(receiptHashHex),
				bytes32Val(dataHashHex),
			])
		);
	}

	public advanceStage(
		actor: string,
		id: string,
		stage: STAGES,
		dataHashHex: string
	): Promise<PreparedTransaction> {
		return this.builder.prepare(
			actor,
			this.call('advance_stage', [
				addressVal(actor),
				stringVal(id),
				stageVal(stage),
				bytes32Val(dataHashHex),
			])
		);
	}

	public attachDocument(actor: string, id: string, docHashHex: string): Promise<PreparedTransaction> {
		return this.builder.prepare(
			actor,
			this.call('attach_document', [addressVal(actor), stringVal(id), bytes32Val(docHashHex)])
		);
	}

	// ── reads ───────────────────────────────────────────────────────────────

	public async getMember(account: string): Promise<OnChainMember | null> {
		const raw = scValToNative(
			await this.builder.read<xdr.ScVal>(this.call('get_member', [addressVal(account)]))
		) as { role: number; org: number } | null;
		if (!raw) return null;
		return { role: ROLE_BY_DISCRIMINANT[Number(raw.role)], org: Number(raw.org) };
	}

	public async getFarmerAgent(): Promise<string | null> {
		const raw = scValToNative(await this.builder.read<xdr.ScVal>(this.call('get_farmer_agent')));
		return (raw as string | null) ?? null;
	}

	public async getFarmer(farmerRef: string): Promise<OnChainFarmer | null> {
		const raw = scValToNative(
			await this.builder.read<xdr.ScVal>(this.call('get_farmer', [stringVal(farmerRef)]))
		) as {
			farmer_ref: string;
			coop: number;
			consent_hash: Uint8Array | null;
			consent_at: bigint;
			profile_hash: Uint8Array | null;
			profile_at: bigint;
		} | null;
		if (!raw) return null;
		return {
			farmer_ref: raw.farmer_ref,
			coop: Number(raw.coop),
			consent_hash: raw.consent_hash ? bytesToHex(raw.consent_hash) : null,
			consent_at: Number(raw.consent_at),
			profile_hash: raw.profile_hash ? bytesToHex(raw.profile_hash) : null,
			profile_at: Number(raw.profile_at),
		};
	}

	public async getBatch(id: string): Promise<OnChainBatch> {
		const raw = scValToNative(
			await this.builder.read<xdr.ScVal>(this.call('get_batch', [stringVal(id)]))
		) as {
			id: string;
			farmer_ref: string;
			coop: number;
			collection_center: number;
			weight_grams: bigint;
			receipt_hash: Uint8Array | null;
			stage: number;
			history: { stage: number; actor: string; timestamp: bigint; data_hash: Uint8Array }[];
			documents: Uint8Array[];
		};
		return {
			id: raw.id,
			farmer_ref: raw.farmer_ref,
			coop: Number(raw.coop),
			collection_center: Number(raw.collection_center),
			weight_grams: raw.weight_grams.toString(),
			receipt_hash: raw.receipt_hash ? bytesToHex(raw.receipt_hash) : null,
			stage: STAGE_BY_DISCRIMINANT[Number(raw.stage)],
			history: raw.history.map((record) => ({
				stage: STAGE_BY_DISCRIMINANT[Number(record.stage)],
				actor: record.actor,
				timestamp: Number(record.timestamp),
				data_hash: bytesToHex(record.data_hash),
			})),
			documents: raw.documents.map((doc) => bytesToHex(doc)),
		};
	}
}
