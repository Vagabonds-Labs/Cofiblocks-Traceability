const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet' ? 'public' : 'testnet'

/** Stellar Expert link for an account, a transaction or a contract. */
export function explorerUrl(kind: 'account' | 'tx' | 'contract', id: string): string {
  return `https://stellar.expert/explorer/${NETWORK}/${kind}/${id}`
}

/** `GABC…WXYZ`: StrKey addresses are long, so show the ends. */
export function shortAddress(address: string | null | undefined): string {
  if (!address) return ''
  return `${address.slice(0, 4)}…${address.slice(-4)}`
}
