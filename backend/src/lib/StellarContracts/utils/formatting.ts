import { StrKey } from '@stellar/stellar-sdk';

/**
 * StrKey addresses are upper-case base32: comparing the normalized text is
 * enough.
 */
export function isSameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
	if (!a || !b) return false;
	return a.trim().toUpperCase() === b.trim().toUpperCase();
}

/** Classic `G…` account. This is what Cavos creates. */
export function isClassicAddress(address: string): boolean {
	return StrKey.isValidEd25519PublicKey(address);
}

/** `C…` contract account: smart wallets and passkeys. */
export function isContractAddress(address: string): boolean {
	return StrKey.isValidContract(address);
}

export function isValidAddress(address: string): boolean {
	return isClassicAddress(address) || isContractAddress(address);
}

/** `Uint8Array`/`Buffer` → lower-case hex. */
export function bytesToHex(value: unknown): string {
	if (value instanceof Uint8Array) return Buffer.from(value).toString('hex');
	return '';
}
