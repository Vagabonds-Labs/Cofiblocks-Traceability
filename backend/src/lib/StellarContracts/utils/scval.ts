import { Address, nativeToScVal, xdr } from '@stellar/stellar-sdk';

import { ROLES, ROLE_DISCRIMINANTS, STAGES, STAGE_DISCRIMINANTS } from '../types/contracts';

/** Conversion to `ScVal`, Soroban's argument format. */

export function addressVal(address: string): xdr.ScVal {
	return Address.fromString(address).toScVal();
}

export function u32Val(value: number): xdr.ScVal {
	return nativeToScVal(Math.trunc(value), { type: 'u32' });
}

export function u64Val(value: bigint | string | number): xdr.ScVal {
	return nativeToScVal(BigInt(value), { type: 'u64' });
}

export function stringVal(value: string): xdr.ScVal {
	return nativeToScVal(value, { type: 'string' });
}

/** `BytesN<32>` from a hex hash (64 characters). */
export function bytes32Val(hex: string): xdr.ScVal {
	const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
	if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
		throw new Error(`Expected a 32-byte hex hash, got: ${hex}`);
	}
	return xdr.ScVal.scvBytes(Buffer.from(clean, 'hex'));
}

/** Contract enums without a payload serialize as their variant's integer. */
export function roleVal(role: ROLES): xdr.ScVal {
	const discriminant = ROLE_DISCRIMINANTS[role];
	if (discriminant === undefined) {
		throw new Error(`Unknown role: ${role}`);
	}
	return u32Val(discriminant);
}

export function stageVal(stage: STAGES): xdr.ScVal {
	const discriminant = STAGE_DISCRIMINANTS[stage];
	if (discriminant === undefined) {
		throw new Error(`Unknown stage: ${stage}`);
	}
	return u32Val(discriminant);
}
