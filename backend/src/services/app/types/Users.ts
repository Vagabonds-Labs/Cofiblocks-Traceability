import { UserEntry } from "@/services/db";
import { TokenPair } from "./Auth";

export interface RegisterUserData {
  walletAddress: string;
  walletProvider?: string;
  /** Base64 signature: SEP-53 for Stellar wallets, the Cavos prefix for Cavos. */
  signature: string;
  /** Cavos only: the control key that signed. If missing, the account itself is assumed. */
  signer?: string;
  nonce: string;
}

export type UserResponse = UserEntry;

export interface RegisterUserResponse {
  user: UserResponse;
  tokens: TokenPair;
}
