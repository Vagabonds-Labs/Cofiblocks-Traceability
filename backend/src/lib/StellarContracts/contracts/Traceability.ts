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
 * Wrapper for the `traceability` contract.
 *
 * - Admin writes (roles, linking farmers) return a `Transaction` signed by the
 *   backend, ready for `TxSubmitter.submitAsService`.
 * - User writes (consent, batches, stages) return a `PreparedTransaction` with
 *   the user as the source account, for their wallet to sign and the backend
 *   to submit with fee-bump.
 */
export class Traceability {
	public readonly contractAddress: string;

	private readonly builder: TxBuilder;

	constructor(client: StellarClient) {
		this.contractAddress = getContractAddress(client.network, StellarContract.TRACEABILITY);
		this.builder = new TxBuilder(client);
	}

	private call(method: string, args: xdr.ScVal[] = []) {
		return { contractId: this.contractAddress, method, args, kind: 'traceability' as const };
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

	public registerFarmer(account: string, farmerRef: string, coop: number): Promise<Transaction> {
		return this.builder.prepareAsService(
			this.call('register_farmer', [addressVal(account), stringVal(farmerRef), u32Val(coop)])
		);
	}

	// ── usuarios ────────────────────────────────────────────────────────────

	public recordConsent(farmer: string, consentHashHex: string): Promise<PreparedTransaction> {
		return this.builder.prepare(
			farmer,
			this.call('record_consent', [addressVal(farmer), bytes32Val(consentHashHex)])
		);
	}

	public createBatch(
		actor: string,
		id: string,
		farmerRef: string,
		collectionCenter: number,
		weightGrams: bigint | number,
		dataHashHex: string
	): Promise<PreparedTransaction> {
		return this.builder.prepare(
			actor,
			this.call('create_batch', [
				addressVal(actor),
				stringVal(id),
				stringVal(farmerRef),
				u32Val(collectionCenter),
				u64Val(weightGrams),
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

	// ── lecturas ────────────────────────────────────────────────────────────

	public async getMember(account: string): Promise<OnChainMember | null> {
		const raw = scValToNative(
			await this.builder.read<xdr.ScVal>(this.call('get_member', [addressVal(account)]))
		) as { role: number; org: number } | null;
		if (!raw) return null;
		return { role: ROLE_BY_DISCRIMINANT[Number(raw.role)], org: Number(raw.org) };
	}

	public async getFarmer(account: string): Promise<OnChainFarmer | null> {
		const raw = scValToNative(
			await this.builder.read<xdr.ScVal>(this.call('get_farmer', [addressVal(account)]))
		) as { farmer_ref: string; coop: number; consent_hash: Uint8Array | null; consent_at: bigint } | null;
		if (!raw) return null;
		return {
			farmer_ref: raw.farmer_ref,
			coop: Number(raw.coop),
			consent_hash: raw.consent_hash ? bytesToHex(raw.consent_hash) : null,
			consent_at: Number(raw.consent_at),
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
			stage: number;
			history: { stage: number; actor: string; timestamp: bigint; data_hash: Uint8Array }[];
		};
		return {
			id: raw.id,
			farmer_ref: raw.farmer_ref,
			coop: Number(raw.coop),
			collection_center: Number(raw.collection_center),
			weight_grams: raw.weight_grams.toString(),
			stage: STAGE_BY_DISCRIMINANT[Number(raw.stage)],
			history: raw.history.map((record) => ({
				stage: STAGE_BY_DISCRIMINANT[Number(record.stage)],
				actor: record.actor,
				timestamp: Number(record.timestamp),
				data_hash: bytesToHex(record.data_hash),
			})),
		};
	}
}
