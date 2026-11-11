"use client";

/**
 * Signs with the Cavos wallet (Telegram or email login).
 *
 * As with Freighter or LOBSTR, the contract with the backend is: take the
 * unsigned XDR and return the signed envelope. Cavos signs with the device's
 * control key (`signXdr`): the Soroban auth entries that name the account and
 * the transaction envelope. The backend submits it.
 *
 * Cavos hooks only exist inside React. `CavosBridge` registers the active
 * session here so that `walletService`, which is not a component, can sign.
 */

interface CavosSession {
  address: string;
  signXdr: (unsignedXdr: string) => Promise<string>;
  /** Creates the account on chain if Cavos has not created it yet. */
  ensureDeployed: (destination: string) => Promise<void>;
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
   * Waits for Cavos to finish restoring the session.
   *
   * On page reload, our backend session already exists but Cavos takes a
   * moment to reconnect the wallet. If it does not show up, the Cavos session
   * expired even though ours is still alive.
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

  /**
   * Makes sure the Cavos account exists on chain.
   *
   * Cavos only creates the account on the first payment (`execute`), and
   * exposes no "create only" call. So we ask it to pay 1 stroop to
   * `destination`: Cavos creates the account (sponsored, 0 XLM) and then the
   * payment fails because the new account has no balance. That failure is
   * expected; the account is what we need, and our faucet funds it next.
   */
  async ensureDeployed(address: string, destination: string): Promise<void> {
    const session = await this.requireSession(address);
    await session.ensureDeployed(destination);
  }

  async logout(): Promise<void> {
    const session = this.session;
    this.session = null;
    session?.logout();
  }
}

export const cavosSigner = new CavosSigner();
