export enum StellarContract {
	TRACEABILITY = "Traceability",
}

/**
 * Staff roles of the `traceability` contract. The order is the one the
 * contract serializes (`contracts/traceability/src/types.rs`): they travel as
 * the variant's integer. Farmers are not staff: the farmer agent acts for them.
 */
export enum ROLES {
	COLLECTOR = "COLLECTOR",
	COMMITTEE_MEMBER = "COMMITTEE_MEMBER",
	INDUSTRY_MANAGER = "INDUSTRY_MANAGER",
	STORE_KEEPER = "STORE_KEEPER",
	EXPORT_MANAGER = "EXPORT_MANAGER",
}

export const ROLE_DISCRIMINANTS: Record<ROLES, number> = {
	[ROLES.COLLECTOR]: 0,
	[ROLES.COMMITTEE_MEMBER]: 1,
	[ROLES.INDUSTRY_MANAGER]: 2,
	[ROLES.STORE_KEEPER]: 3,
	[ROLES.EXPORT_MANAGER]: 4,
};

/** Batch stages, in the contract's order. */
export enum STAGES {
	DELIVERED = "DELIVERED",
	RECEIVED = "RECEIVED",
	WASHING = "WASHING",
	FERMENTATION = "FERMENTATION",
	DRYING = "DRYING",
	STORAGE = "STORAGE",
	IN_TRANSPORT_TO_UNION = "IN_TRANSPORT_TO_UNION",
	PREPARED_WITH_EXPORTABLE_BAG = "PREPARED_WITH_EXPORTABLE_BAG",
	SOLD = "SOLD",
}

export const STAGE_DISCRIMINANTS: Record<STAGES, number> = {
	[STAGES.DELIVERED]: 0,
	[STAGES.RECEIVED]: 1,
	[STAGES.WASHING]: 2,
	[STAGES.FERMENTATION]: 3,
	[STAGES.DRYING]: 4,
	[STAGES.STORAGE]: 5,
	[STAGES.IN_TRANSPORT_TO_UNION]: 6,
	[STAGES.PREPARED_WITH_EXPORTABLE_BAG]: 7,
	[STAGES.SOLD]: 8,
};

function invert<T extends string>(table: Record<T, number>): Record<number, T> {
	return Object.fromEntries(Object.entries(table).map(([key, value]) => [value, key])) as Record<number, T>;
}

export const ROLE_BY_DISCRIMINANT = invert(ROLE_DISCRIMINANTS);
export const STAGE_BY_DISCRIMINANT = invert(STAGE_DISCRIMINANTS);

/** `get_member`, already converted to JS types. */
export interface OnChainMember {
	role: ROLES;
	org: number;
}

/** `get_farmer`, already converted to JS types. */
export interface OnChainFarmer {
	farmer_ref: string;
	coop: number;
	/** SHA-256 hex, or `null` if they have not accepted it yet. */
	consent_hash: string | null;
	consent_at: number;
	/** SHA-256 hex of the latest profile version, or `null`. */
	profile_hash: string | null;
	profile_at: number;
}

export interface OnChainStageRecord {
	stage: STAGES;
	actor: string;
	timestamp: number;
	data_hash: string;
}

/** `get_batch`, already converted to JS types. */
export interface OnChainBatch {
	id: string;
	farmer_ref: string;
	coop: number;
	collection_center: number;
	/** Grams, as a string. "0" until reception. */
	weight_grams: string;
	/** SHA-256 hex of the receipt, or `null` until reception. */
	receipt_hash: string | null;
	stage: STAGES;
	history: OnChainStageRecord[];
	/** SHA-256 hex of each attached document. */
	documents: string[];
}
