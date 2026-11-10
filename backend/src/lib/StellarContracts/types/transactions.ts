/** Lo que el backend le devuelve al frontend para que la wallet firme. */
export interface PreparedTransaction {
	/** Sobre de transacción en base64, ya simulado (footprint, auth y fee dentro). */
	xdr: string;
	/** La wallet lo necesita para firmar contra la red correcta. */
	network_passphrase: string;
	/** Unix timestamp en segundos: después de esto la transacción ya no entra. */
	valid_until: number;
}

/** Resultado de enviar una transacción. */
export interface SubmittedTransaction {
	hash: string;
	ledger: number;
}
