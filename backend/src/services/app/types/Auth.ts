export interface TokenPair {
    accessToken: string;
    refreshToken: string;
  }

export interface TokenPayload {
    userId: string;
    walletAddress: string;
    is_admin: boolean;
    /** Staff role in the pilot, or `null` if they do not have one yet. */
    role: string | null;
    organization_id: string | null;
}