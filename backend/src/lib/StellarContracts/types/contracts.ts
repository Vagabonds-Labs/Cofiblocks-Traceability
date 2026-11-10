export enum StellarContract {
	TRACEABILITY = "Traceability",
}

/**
 * Roles of the `traceability` contract. The order is the one the contract
 * serializes (`contracts/traceability/src/types.rs`): they travel as the
 * variant's integer.
 */
export enum ROLES {
	FARMER = "FARMER",
	COLLECTOR = "COLLECTOR",
	COMMITTEE_MEMBER = "COMMITTEE_MEMBER",
	INDUSTRY_MANAGER = "INDUSTRY_MANAGER",
	STORE_KEEPER = "STORE_KEEPER",
	EXPORT_MANAGER = "EXPORT_MANAGER",
}

export const ROLE_DISCRIMINANTS: Record<ROLES, number> = {
	[ROLES.FARMER]: 0,
	[ROLES.COLLECTOR]: 1,
	[ROLES.COMMITTEE_MEMBER]: 2,
	[ROLES.INDUSTRY_MANAGER]: 3,
	[ROLES.STORE_KEEPER]: 4,
	[ROLES.EXPORT_MANAGER]: 5,
};

/** Batch stages, in the contract's order. */
export enum STAGES {
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
	[STAGES.RECEIVED]: 0,
	[STAGES.WASHING]: 1,
	[STAGES.FERMENTATION]: 2,
	[STAGES.DRYING]: 3,
	[STAGES.STORAGE]: 4,
	[STAGES.IN_TRANSPORT_TO_UNION]: 5,
	[STAGES.PREPARED_WITH_EXPORTABLE_BAG]: 6,
	[STAGES.SOLD]: 7,
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
	/** SHA-256 hex, or `null` if they have not signed yet. */
	consent_hash: string | null;
	consent_at: number;
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
	weight_grams: string;
	stage: STAGES;
	history: OnChainStageRecord[];
}
