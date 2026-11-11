import { ROLES, STAGES } from './contracts';

/** topics: `["role_granted", account]` */
export interface RoleGrantedEvent {
	account: string;
	role: ROLES;
	org: number;
}

/** topics: `["farmer_agent_set", agent]` */
export interface FarmerAgentSetEvent {
	agent: string;
}

/** topics: `["farmer_registered", farmer_ref]` */
export interface FarmerRegisteredEvent {
	farmer_ref: string;
	coop: number;
}

/** topics: `["consent_recorded", farmer_ref]` */
export interface ConsentRecordedEvent {
	farmer_ref: string;
	consent_hash: string;
}

/** topics: `["profile_updated", farmer_ref]` */
export interface ProfileUpdatedEvent {
	farmer_ref: string;
	profile_hash: string;
}

/** topics: `["batch_created", id]` */
export interface BatchCreatedEvent {
	id: string;
	farmer_ref: string;
	coop: number;
	collection_center: number;
	data_hash: string;
}

/** topics: `["reception_recorded", id]` */
export interface ReceptionRecordedEvent {
	id: string;
	collector: string;
	weight_grams: string;
	receipt_hash: string;
	data_hash: string;
}

/** topics: `["stage_advanced", id]` */
export interface StageAdvancedEvent {
	id: string;
	stage: STAGES;
	actor: string;
	data_hash: string;
}

/** topics: `["document_attached", id]` */
export interface DocumentAttachedEvent {
	id: string;
	actor: string;
	doc_hash: string;
}

/** Raw event, for routes that return everything uninterpreted. */
export interface RawEvent {
	contractId: string;
	name: string;
	topics: unknown[];
	data: Record<string, unknown> | unknown;
}
