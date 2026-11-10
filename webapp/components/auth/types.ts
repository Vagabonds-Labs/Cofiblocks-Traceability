export interface LoginMethodsProps {
  walletError: string | null
  isConnecting: boolean
  onWallet: () => void | Promise<void>
  /** Called when the Telegram or email login (Cavos) finishes. */
  onEmailLoggedIn: () => void
}
