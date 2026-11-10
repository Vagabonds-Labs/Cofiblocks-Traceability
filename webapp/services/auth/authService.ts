// services/authService.ts
import { api } from '@/lib/api';
import { User } from './types';

export class AuthService {
  private static readonly USER_KEY = "user";

  // ---- Storage helpers ----
  // Access tokens are now stored in HttpOnly cookies, not localStorage

  private get storedUser(): User | null {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(AuthService.USER_KEY);
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private set storedUser(user: User | null) {
    if (typeof window === "undefined") return;
    if (!user) {
      localStorage.removeItem(AuthService.USER_KEY);
      return;
    }
    localStorage.setItem(AuthService.USER_KEY, JSON.stringify(user));
  }

  private notifyAuthChange() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("auth-change"));
    }
  }

  // ---- Public API ----
  // Access token is no longer accessible client-side (HttpOnly cookie)
  getAccessToken() {
    return null; // Tokens are in HttpOnly cookies
  }

  getCurrentUser() {
    return this.storedUser;
  }

  isAuthenticated() {
    // Check if user exists - access token is in HttpOnly cookie
    return Boolean(this.storedUser);
  }

  private setAuth(user: User) {
    // Access token is stored in HttpOnly cookie by backend
    // We only need to store user data
    this.storedUser = user;
    this.notifyAuthChange();
  }

  private clearAuth() {
    // Access token cookie is cleared by backend on logout
    // We only need to clear user data
    this.storedUser = null;
    this.notifyAuthChange();
  }

  async logout() {
    try {
      await api.post("/auth/logout", {});
    } finally {
      this.clearAuth();
    }
  }

  async refreshAccessToken(): Promise<boolean> {
    try {
      // Access token is set as HttpOnly cookie by backend
      // No need to read it from response
      await api.post("/auth/refresh", {});

      // If we have a user, keep it; otherwise try to fetch it
      const user = this.getCurrentUser();
      if (!user) {
        try {
          const fetchedUser = await this.getCurrentUserFromApi();
          this.setAuth(fetchedUser);
        } catch {
          // If we can't fetch user, auth might be invalid
          this.clearAuth();
          return false;
        }
      }

      return true;
    } catch {
      this.clearAuth();
      return false;
    }
  }

  async getCurrentUserFromApi(): Promise<User> {
    const res = await api.get<{ data: { user: User } }>("/auth/me");
    return res.data.user;
  }

  async updateUser(data: Partial<Pick<User, "name" | "email">>): Promise<User> {
    const res = await api.patch<{ data: { user: User } }>("/users", data);
    
    // Update stored user data
    this.setAuth(res.data.user);

    return res.data.user;
  }

  /**
   * Requests the nonce to sign from the backend.
   *
   * Previously the client generated it and the backend never invalidated it,
   * so the same signature worked forever. Now it comes from the backend,
   * expires in 5 minutes and can be used only once.
   */
  async requestNonce(address?: string) {
    const res = await api.post<{
      data: { nonce: string; message: string; expires_at: number };
    }>("/auth/nonce", address ? { address } : {});
    return res.data;
  }

  /**
   * `signature` is the base64 signature. `provider` says what signed it: a
   * Stellar wallet (SEP-53) or Cavos (its own prefix, with `signer`, the
   * control key of the device that signed).
   */
  async registerWallet(
    address: string,
    signature: string,
    nonce: string,
    provider: "stellar" | "cavos" = "stellar",
    signer?: string
  ) {
    const res = await api.post<{
      data: {
        user: User;
      },
      message: string;
    }>("/auth/register_wallet", {
      address,
      signature,
      nonce,
      provider,
      ...(signer && { signer }),
    });

    // Access token is set as HttpOnly cookie by backend
    // We only need to store user data
    this.setAuth(res.data.user);
    return res;
  }

  async restoreSessionFromRefreshToken(): Promise<boolean> {
    const ok = await this.refreshAccessToken();
    if (!ok) return false;

    if (!this.getCurrentUser()) {
      try {
        const user = await this.getCurrentUserFromApi();
        this.storedUser = user;
      } catch {
        // Optional: swallow error
      }
    }

    return true;
  }
}

export const authService = new AuthService();
