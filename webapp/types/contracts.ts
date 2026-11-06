/** Transacción que arma el backend, ya simulada, para que la firme la wallet. */
export interface PreparedTransaction {
  /** Sobre de transacción en base64. */
  xdr: string
  /** La wallet lo necesita para firmar contra la red correcta. */
  network_passphrase: string
  /** Unix timestamp en segundos; después de esto la transacción no entra. */
  valid_until: number
}
