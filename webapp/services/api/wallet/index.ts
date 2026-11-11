import { api } from '@/lib/api'

export interface WalletInfo {
  address: string
  provider: string | null
  /** Whether the account exists on the Stellar network. */
  exists: boolean
  balance_xlm: string | null
  funded_at: string | null
  fund_tx: string | null
}

export interface Funding {
  tx_hash: string
  funded_at: string
  already_funded: boolean
}

export const walletService = {
  async get(): Promise<WalletInfo> {
    const response = await api.get<{ data: { wallet: WalletInfo } }>('/wallet')
    return response.data.wallet
  },

  /** Sends testnet XLM to the user's account, once. The account must exist. */
  async fund(): Promise<Funding> {
    const response = await api.post<{ data: { funding: Funding } }>('/wallet/fund')
    return response.data.funding
  },

  /** Destination of the 1-stroop payment that makes Cavos create the account. */
  async faucetAddress(): Promise<string | null> {
    const response = await api.get<{ data: { faucetAddress: string | null } }>('/config/stellar')
    return response.data.faucetAddress
  },
}
