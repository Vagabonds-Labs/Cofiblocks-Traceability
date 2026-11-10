/** What the backend returns to the frontend for the wallet to sign. */
export interface PreparedTransaction {
	/** Base64 transaction envelope, already simulated (footprint, auth and fee included). */
	xdr: string;
	/** The wallet needs it to sign for the right network. */
	network_passphrase: string;
	/** Unix timestamp in seconds: after this the transaction is no longer accepted. */
	valid_until: number;
}

/** Result of submitting a transaction. */
export interface SubmittedTransaction {
	hash: string;
	ledger: number;
}
