import { StrKey } from '@stellar/stellar-sdk';

/**
 * Las direcciones StrKey son base32 en mayúsculas: alcanza con comparar el texto
 * normalizado.
 */
export function isSameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
	if (!a || !b) return false;
	return a.trim().toUpperCase() === b.trim().toUpperCase();
}

/** Cuenta clásica `G…`. Es la que crea Cavos. */
export function isClassicAddress(address: string): boolean {
	return StrKey.isValidEd25519PublicKey(address);
}

/** Cuenta contrato `C…`: smart wallets y passkeys. */
export function isContractAddress(address: string): boolean {
	return StrKey.isValidContract(address);
}

export function isValidAddress(address: string): boolean {
	return isClassicAddress(address) || isContractAddress(address);
}

/** `Uint8Array`/`Buffer` → hex en minúsculas. */
export function bytesToHex(value: unknown): string {
	if (value instanceof Uint8Array) return Buffer.from(value).toString('hex');
	return '';
}
