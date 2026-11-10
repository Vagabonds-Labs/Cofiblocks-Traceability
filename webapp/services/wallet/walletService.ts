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
 * Acceso a la wallet del usuario.
 *
 * El backend arma y simula la transacción entera, la wallet sólo la firma, y el
 * backend la envía con fee-bump. Por eso el servicio devuelve el XDR firmado en
 * vez de un hash: el hash lo saca el backend del submit, que es más confiable
 * que confiar en el que reporte el cliente.
 *
 * Wallets soportadas: Freighter, xBull, Albedo, Lobstr y Rabet. WalletConnect
 * requiere `@reown/appkit` y un projectId de Reown; se agrega como un módulo más
 * en `init()` cuando esas dos cosas estén.
 *
 * Los usuarios que entraron con Telegram o email (`walletProvider: 'cavos'`)
 * firman con su wallet de Cavos en vez del kit.
 */
class WalletService {
  private initialized = false;

  private isCavosUser(): boolean {
    return authService.getCurrentUser()?.walletProvider === "cavos";
  }

  /** Idempotente: el kit se inicializa una sola vez, y sólo en el browser. */
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

  /** Abre el modal de selección y devuelve la dirección conectada. */
  async connect(): Promise<string> {
    this.init();
    const { address } = await StellarWalletsKit.authModal();
    if (!address) throw new Error("Connection cancelled");
    this.rememberWallet();
    return address;
  }

  /** Reconecta en silencio si el usuario ya había elegido una wallet. */
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
    // Cerrar también la sesión de Cavos: si no, el próximo "continuar con
    // Telegram o email" entraría directo con la cuenta anterior.
    await cavosSigner.logout().catch((err) => console.error("Cavos logout error:", err));
    this.init();
    try {
      await StellarWalletsKit.disconnect();
    } finally {
      this.forgetWallet();
    }
  }

  /**
   * Exige que la wallet conectada sea la de la sesión.
   *
   * Si el usuario cambió de cuenta en la extensión, firmaría con una dirección
   * que no es la del pedido y el `require_auth` del contrato lo rechazaría —
   * mejor cortar acá con un mensaje claro.
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
   * Firma la transacción que armó el backend y devuelve el sobre firmado.
   *
   * El backend se encarga del envío: lo envuelve en un fee-bump y paga el fee,
   * así el usuario nunca necesita XLM.
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

  /** Firma una transacción sin exigir que haya sesión en nuestro backend. */
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

  /** Firma un mensaje con formato SEP-53. Devuelve la firma en base64. */
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
