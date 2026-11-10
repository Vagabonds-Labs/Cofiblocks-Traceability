/** Transaction built by the backend, already simulated, for the wallet to sign. */
export interface PreparedTransaction {
  /** Base64 transaction envelope. */
  xdr: string
  /** The wallet needs it to sign for the right network. */
  network_passphrase: string
  /** Unix timestamp in seconds; after this the transaction is no longer accepted. */
  valid_until: number
}
