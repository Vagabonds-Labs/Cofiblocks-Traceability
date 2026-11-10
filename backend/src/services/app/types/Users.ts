import { UserEntry } from "@/services/db";
import { TokenPair } from "./Auth";

export interface RegisterUserData {
  walletAddress: string;
  walletProvider?: string;
  /** Firma en base64: SEP-53 para wallets de Stellar, prefijo de Cavos para Cavos. */
  signature: string;
  /** Sólo Cavos: la control key que firmó. Si falta, se asume la propia cuenta. */
  signer?: string;
  nonce: string;
}

export type UserResponse = UserEntry;

export interface RegisterUserResponse {
  user: UserResponse;
  tokens: TokenPair;
}
