import { HttpException } from '@/exceptions/HttpException';

type ErrorTable = Record<number, { status: number; code: string; message: string }>;

/**
 * Error codes of the `traceability` contract (see
 * `contracts/traceability/src/types.rs`).
 *
 * Soroban returns them during simulation as `Error(Contract, #N)`. Translating
 * them here lets us respond with domain errors instead of an opaque RPC
 * failure.
 */
const TRACEABILITY_ERRORS: ErrorTable = {
  1: { status: 500, code: 'NOT_INITIALIZED', message: 'Contract not initialized' },
  2: { status: 403, code: 'NOT_A_MEMBER', message: 'The account has no role assigned on chain' },
  3: { status: 403, code: 'UNAUTHORIZED', message: 'The account role does not allow this operation' },
  4: { status: 403, code: 'WRONG_ORGANIZATION', message: 'The batch belongs to another cooperative' },
  5: { status: 400, code: 'USE_REGISTER_FARMER', message: 'Farmers are registered with register_farmer' },
  6: { status: 404, code: 'FARMER_NOT_FOUND', message: 'Farmer not registered on chain' },
  7: { status: 409, code: 'FARMER_REF_TAKEN', message: 'This farmer ID is already linked to another wallet' },
  8: { status: 409, code: 'BATCH_ALREADY_EXISTS', message: 'A batch with this number already exists' },
  9: { status: 404, code: 'BATCH_NOT_FOUND', message: 'Batch not found on chain' },
  10: { status: 400, code: 'INVALID_TRANSITION', message: 'The batch cannot move to that stage from its current stage' },
  11: { status: 400, code: 'INVALID_WEIGHT', message: 'Weight must be greater than zero' },
  12: { status: 400, code: 'INVALID_ID', message: 'ID is empty or too long' },
};

export type ContractKind = 'traceability';

const TABLES: Record<ContractKind, ErrorTable> = {
  traceability: TRACEABILITY_ERRORS,
};

/** Extracts the `#N` from an `Error(Contract, #N)`. */
export function parseContractErrorCode(raw: string): number | null {
  const match = /Error\(Contract, #(\d+)\)/.exec(raw);
  return match ? Number(match[1]) : null;
}

/**
 * An archived storage entry makes the simulation fail until someone restores
 * it. It is reported explicitly instead of as a generic error.
 */
export function isArchivedStateError(raw: string): boolean {
  return /archived|ExceededLimit.*Storage|entry (is |has been )?expired/i.test(raw);
}

export function toDomainError(raw: string, kind: ContractKind = 'traceability'): HttpException {
  if (isArchivedStateError(raw)) {
    return new HttpException(
      409,
      'On-chain state is archived and needs to be restored before this operation',
      'STATE_ARCHIVED'
    );
  }

  const code = parseContractErrorCode(raw);
  if (code !== null) {
    const known = TABLES[kind][code];
    if (known) {
      return new HttpException(known.status, known.message, known.code);
    }
    return new HttpException(400, `Contract error #${code}`, 'CONTRACT_ERROR');
  }

  return new HttpException(502, `Stellar transaction failed: ${raw}`, 'STELLAR_TX_FAILED');
}
