import { ROLES, STAGES } from './contracts';

/** topics: `["role_granted", account]` */
export interface RoleGrantedEvent {
	account: string;
	role: ROLES;
	org: number;
}

/** topics: `["farmer_registered", account]` */
export interface FarmerRegisteredEvent {
	account: string;
	farmer_ref: string;
	coop: number;
}

/** topics: `["consent_recorded", account]` */
export interface ConsentRecordedEvent {
	account: string;
	consent_hash: string;
}

/** topics: `["batch_created", id]` */
export interface BatchCreatedEvent {
	id: string;
	farmer_ref: string;
	coop: number;
	collection_center: number;
	weight_grams: string;
	actor: string;
	data_hash: string;
}

/** topics: `["stage_advanced", id]` */
export interface StageAdvancedEvent {
	id: string;
	stage: STAGES;
	actor: string;
	data_hash: string;
}

/** Raw event, for routes that return everything uninterpreted. */
export interface RawEvent {
	contractId: string;
	name: string;
	topics: unknown[];
	data: Record<string, unknown> | unknown;
}
