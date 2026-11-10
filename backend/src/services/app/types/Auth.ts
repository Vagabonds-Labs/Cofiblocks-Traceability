export interface TokenPair {
    accessToken: string;
    refreshToken: string;
  }

export interface TokenPayload {
    userId: string;
    walletAddress: string;
    is_admin: boolean;
    /** Rol del personal en el piloto, o `null` si todavía no tiene. */
    role: string | null;
    organization_id: string | null;
}