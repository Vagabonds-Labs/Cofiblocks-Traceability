import { UserEntry } from "@/services/db";
import { TokenPair } from "./Auth";

export interface RegisterUserData {
  walletAddress: string;
  walletProvider?: string;
  /** Firma SEP-53 en base64. */
  signature: string;
  nonce: string;
}

export type UserResponse = UserEntry;

export interface RegisterUserResponse {
  user: UserResponse;
  tokens: TokenPair;
}
