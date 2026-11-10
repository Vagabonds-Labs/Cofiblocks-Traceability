"use client";

/**
 * Firma con la wallet de Cavos (login con Telegram o email).
 *
 * Igual que con Freighter o LOBSTR, el contrato con el backend es: recibe el XDR
 * sin firmar y devuelve el sobre firmado. Cavos firma con la control key del
 * dispositivo (`signXdr`): las entradas de auth de Soroban que nombran a la
 * cuenta y el sobre de la transacción. El envío lo hace el backend.
 *
 * Los hooks de Cavos sólo existen dentro de React. `CavosBridge` registra acá la
 * sesión activa para que `walletService`, que no es un componente, pueda firmar.
 */

interface CavosSession {
  address: string;
  signXdr: (unsignedXdr: string) => Promise<string>;
  logout: () => void;
}

const SESSION_WAIT_MS = 10_000;

class CavosSigner {
  private session: CavosSession | null = null;
  private waiters: Array<() => void> = [];

  register(session: CavosSession): void {
    this.session = session;
    const waiters = this.waiters;
    this.waiters = [];
    waiters.forEach((resolve) => resolve());
  }

  clear(): void {
    this.session = null;
  }

  hasAddress(address: string): boolean {
    return this.session?.address === address;
  }

  /**
   * Espera a que Cavos termine de restaurar la sesión.
   *
   * Al recargar la página, la sesión de nuestro backend ya existe pero Cavos
   * tarda un momento en reconectar la wallet. Si no aparece, es que la sesión
   * de Cavos venció aunque la nuestra siga viva.
   */
  private async requireSession(address: string): Promise<CavosSession> {
    if (!this.session) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, SESSION_WAIT_MS);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    if (!this.session) {
      throw new Error("Your session expired. Log out and sign in again.");
    }
    if (this.session.address !== address) {
      throw new Error("Wallet mismatch, please sign in with the correct account");
    }
    return this.session;
  }

  async signTransaction(xdr: string, address: string): Promise<string> {
    const session = await this.requireSession(address);
    return session.signXdr(xdr);
  }

  async logout(): Promise<void> {
    const session = this.session;
    this.session = null;
    session?.logout();
  }
}

export const cavosSigner = new CavosSigner();
