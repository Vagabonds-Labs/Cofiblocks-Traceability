"use client";

import { StellarWalletsKit, Networks } from "@creit.tech/stellar-wallets-kit";
import { FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";
import { AlbedoModule } from "@creit.tech/stellar-wallets-kit/modules/albedo";
import { LobstrModule } from "@creit.tech/stellar-wallets-kit/modules/lobstr";
import { RabetModule } from "@creit.tech/stellar-wallets-kit/modules/rabet";

import { authService } from "@/services/auth/authService";
import { cavosSigner } from "@/services/wallet/cavosSigner";
import { PreparedTransaction } from "@/types/contracts";

const SELECTED_WALLET_KEY = "cofiblocks:selected-wallet";

function networkFromEnv(): Networks {
  return process.env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet"
    ? Networks.PUBLIC
    : Networks.TESTNET;
}

/**
 * Access to the user's wallet.
 *
 * The backend builds and simulates the whole transaction, the wallet only
 * signs it, and the backend submits it with fee-bump. That is why the service
 * returns the signed XDR instead of a hash: the backend gets the hash from the
 * submission, which is more reliable than trusting the one the client reports.
 *
 * Supported wallets: Freighter, xBull, Albedo, Lobstr and Rabet. WalletConnect
 * needs `@reown/appkit` and a Reown projectId; it is added as one more module
 * in `init()` once both are available.
 *
 * Users who signed in with Telegram or email (`walletProvider: 'cavos'`) sign
 * with their Cavos wallet instead of the kit.
 */
class WalletService {
  private initialized = false;

  private isCavosUser(): boolean {
    return authService.getCurrentUser()?.walletProvider === "cavos";
  }

  /** Idempotent: the kit is initialized only once, and only in the browser. */
  private init(): void {
    if (this.initialized || typeof window === "undefined") return;

    StellarWalletsKit.init({
      modules: [
        new FreighterModule(),
        new xBullModule(),
        new AlbedoModule(),
        new LobstrModule(),
        new RabetModule(),
      ],
      network: networkFromEnv(),
      selectedWalletId: window.localStorage.getItem(SELECTED_WALLET_KEY) ?? undefined,
    });
    this.initialized = true;
  }

  private rememberWallet(): void {
    if (typeof window === "undefined") return;
    const id = StellarWalletsKit.selectedModule?.productId;
    if (id) window.localStorage.setItem(SELECTED_WALLET_KEY, id);
  }

  private forgetWallet(): void {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(SELECTED_WALLET_KEY);
  }

  /** Opens the selection modal and returns the connected address. */
  async connect(): Promise<string> {
    this.init();
    const { address } = await StellarWalletsKit.authModal();
    if (!address) throw new Error("Connection cancelled");
    this.rememberWallet();
    return address;
  }

  /** Reconnects silently if the user had already chosen a wallet. */
  async trySilent(): Promise<string | null> {
    if (typeof window === "undefined") return null;
    if (!window.localStorage.getItem(SELECTED_WALLET_KEY)) return null;
    this.init();
    try {
      const { address } = await StellarWalletsKit.getAddress();
      return address || null;
    } catch {
      return null;
    }
  }

  async isConnected(): Promise<boolean> {
    const user = authService.getCurrentUser();
    if (!user?.walletAddress) return false;
    const address = await this.trySilent();
    return address === user.walletAddress;
  }

  async disconnect(): Promise<void> {
    // Close the Cavos session too: otherwise the next "continue with Telegram
    // or email" would sign straight in with the previous account.
    await cavosSigner.logout().catch((err) => console.error("Cavos logout error:", err));
    this.init();
    try {
      await StellarWalletsKit.disconnect();
    } finally {
      this.forgetWallet();
    }
  }

  /**
   * Requires the connected wallet to be the session's wallet.
   *
   * If the user switched accounts in the extension, they would sign with an
   * address that is not the one in the request, and the contract's
   * `require_auth` would reject it — better to stop here with a clear message.
   */
  private async assertSessionWallet(): Promise<string> {
    const user = authService.getCurrentUser();
    if (!user?.walletAddress) throw new Error("No wallet address found");

    let address = await this.trySilent();
    if (!address) {
      address = await this.connect();
    }
    if (address !== user.walletAddress) {
      await this.disconnect();
      throw new Error("Wallet mismatch, please connect the correct wallet");
    }
    return address;
  }

  /**
   * Signs the transaction the backend built and returns the signed envelope.
   *
   * The backend handles submission: it wraps it in a fee-bump and pays the
   * fee, so the user never needs XLM.
   */
  async signTransaction(prepared: PreparedTransaction): Promise<string> {
    if (prepared.valid_until * 1000 < Date.now()) {
      throw new Error("The transaction expired before being signed. Try again.");
    }

    if (this.isCavosUser()) {
      const user = authService.getCurrentUser();
      if (!user?.walletAddress) throw new Error("No wallet address found");
      return cavosSigner.signTransaction(prepared.xdr, user.walletAddress);
    }

    this.init();
    const address = await this.assertSessionWallet();

    const { signedTxXdr } = await StellarWalletsKit.signTransaction(prepared.xdr, {
      networkPassphrase: prepared.network_passphrase,
      address,
    });
    return signedTxXdr;
  }

  /** Signs a transaction without requiring a session in our backend. */
  async signTransactionAs(prepared: PreparedTransaction, address: string): Promise<string> {
    if (this.isCavosUser() || cavosSigner.hasAddress(address)) {
      return cavosSigner.signTransaction(prepared.xdr, address);
    }
    this.init();
    const { signedTxXdr } = await StellarWalletsKit.signTransaction(prepared.xdr, {
      networkPassphrase: prepared.network_passphrase,
      address,
    });
    return signedTxXdr;
  }

  /** Signs a message in SEP-53 format. Returns the base64 signature. */
  async signMessage(message: string, address: string): Promise<string> {
    this.init();
    const { signedMessage } = await StellarWalletsKit.signMessage(message, {
      networkPassphrase: networkFromEnv(),
      address,
    });
    return signedMessage;
  }
}

export const walletService = new WalletService();
