import { HttpException } from '@/exceptions/HttpException';
import { logger } from '@/lib/logger';
import * as OnChainTraceabilityService from '@/services/onchain/OnChainTraceabilityService';

/** Where a record keeps its on-chain write. */
export interface ChainWriteState {
  /** Hash of the transaction, stored before it is sent. */
  tx: string | null;
  /** Expiry of that transaction (its time bounds). */
  txValidUntil: Date | null;
  /** Set once the transaction is confirmed and verified. */
  confirmedAt: Date | null;
}

export interface ChainWrite {
  /** Short name for logs, e.g. `create_batch KK-ID001`. */
  label: string;
  state: ChainWriteState;
  /**
   * Sends the transaction: calls `beforeSubmit` with its final hash and expiry
   * before anything goes out, then submits it and returns the hash. Use
   * `asFarmerAgent(build)` for farmer actions or `asStaffSigned(xdr)` for a
   * transaction the staff member's wallet signed.
   */
  send: (beforeSubmit: (hash: string, validUntil: Date) => Promise<void>) => Promise<string>;
  /**
   * Stores `hash` as the record's transaction, but only if it still holds
   * `previous` and is not confirmed. Returns `false` if someone else got
   * there first.
   */
  claim: (previous: string | null, hash: string, validUntil: Date) => Promise<boolean>;
  /** Clears `hash` from the record (only if it still holds it): it never landed. */
  release: (hash: string) => Promise<void>;
  /** Checks on chain that `hash` did what was asked, and marks the record confirmed. */
  confirm: (hash: string) => Promise<void>;
  /** Error for "sent but not confirmed yet"; a 503 so the caller retries. */
  pending: () => HttpException;
}

/** `send` for a farmer action: the farmer agent signs, the admin fee-bumps. */
export function asFarmerAgent(build: OnChainTraceabilityService.FarmerAgentBuild): ChainWrite['send'] {
  return (beforeSubmit) => OnChainTraceabilityService.submitAsFarmerAgent(build, beforeSubmit);
}

/** `send` for a transaction signed by a staff wallet: the admin fee-bumps it. */
export function asStaffSigned(signedXdr: string): ChainWrite['send'] {
  return (beforeSubmit) => OnChainTraceabilityService.submitStaffSigned(signedXdr, beforeSubmit);
}

/**
 * Writes a record on chain exactly once and returns the transaction hash.
 *
 * The hash is stored before sending. A later call that finds a stored hash
 * that is not confirmed asks the network how it ended instead of sending
 * another transaction: confirmed → done; failed, or proven never to have
 * landed → send a new one; anything else → still pending (a transaction that
 * does not show up yet may have landed or still land).
 */
export async function ensureOnChain(write: ChainWrite): Promise<string> {
  const { state } = write;
  if (state.tx && state.confirmedAt) return state.tx;

  const confirmed = async (hash: string) => {
    await write.confirm(hash);
    return hash;
  };

  if (state.tx) {
    const outcome = await OnChainTraceabilityService.getTransactionOutcome(state.tx, state.txValidUntil);
    if (outcome === 'success') return confirmed(state.tx);
    if (outcome === 'pending') throw write.pending();
  }

  let sentHash: string | null = null;
  let sentValidUntil: Date | null = null;
  try {
    const hash = await write.send(async (hash, validUntil) => {
      if (!(await write.claim(state.tx, hash, validUntil))) throw write.pending();
      sentHash = hash;
      sentValidUntil = validUntil;
    });
    return await confirmed(hash);
  } catch (error) {
    if (!sentHash) throw error;
    const outcome = await OnChainTraceabilityService.getTransactionOutcome(sentHash, sentValidUntil);
    if (outcome === 'success') return confirmed(sentHash);
    if (outcome === 'failed' || outcome === 'never_landed') {
      await write.release(sentHash);
      throw error;
    }
    logger.warn({ error, label: write.label, hash: sentHash }, 'On-chain write outcome unknown, keeping it pending');
    throw write.pending();
  }
}

/** The 503 every write returns while its transaction is unconfirmed. */
export function transactionPending(): HttpException {
  return new HttpException(
    503,
    'The on-chain transaction was sent but is not confirmed yet. Retry in a minute.',
    'TRANSACTION_PENDING'
  );
}
