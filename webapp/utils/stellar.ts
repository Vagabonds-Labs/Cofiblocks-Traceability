const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet' ? 'public' : 'testnet'

/** Enlace a Stellar Expert para una cuenta, una transacción o un contrato. */
export function explorerUrl(kind: 'account' | 'tx' | 'contract', id: string): string {
  return `https://stellar.expert/explorer/${NETWORK}/${kind}/${id}`
}

/** `GABC…WXYZ`: las direcciones StrKey son largas, se muestra la punta. */
export function shortAddress(address: string | null | undefined): string {
  if (!address) return ''
  return `${address.slice(0, 4)}…${address.slice(-4)}`
}
