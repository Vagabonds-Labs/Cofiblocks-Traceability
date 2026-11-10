import { HttpException } from '@/exceptions/HttpException';
import { ContractFactory } from '@/lib/StellarContracts';
import { isClassicAddress } from '@/lib/StellarContracts/utils';
import { logger } from '@/lib/logger';

const contractFactory = new ContractFactory();

const FRIENDBOT_URL = 'https://friendbot.stellar.org';

/** `true` if the account already exists on the network. */
export async function existsOnNetwork(address: string): Promise<boolean> {
  return (await contractFactory.getClient().loadAccountOrNull(address)) !== null;
}

/**
 * Account creations in progress, by address. Avoids requesting the same
 * account twice when the user signs in twice in a row. It is per process: it
 * does not replace the faucet's persisted state (`fundedAt`/`fundTx`), which
 * comes with `POST /wallet/fund`.
 */
const inFlight = new Map<string, Promise<string | null>>();

/**
 * Creates the user's account if it does not exist yet.
 *
 * It is needed because the transactions the user signs use them as the source
 * account. It only works on **testnet**, and Friendbot creates the account: the
 * backend does not spend its own balance. Previously the admin account funded
 * it with 1 XLM, and since anyone can generate keys and sign in, anyone could
 * drain it; on mainnet it would have spent real funds.
 *
 * On any other network it creates nothing: that needs a faucet with a budget
 * and limits, which does not exist yet.
 *
 * Returns the transaction hash, or `null` if the account already existed.
 */
export async function ensureAccount(address: string): Promise<string | null> {
  if (!isClassicAddress(address)) {
    throw new HttpException(400, 'Only classic Stellar accounts (G…) are supported', 'UNSUPPORTED_ACCOUNT_TYPE');
  }
  const network = contractFactory.getClient().network;
  if (network !== 'testnet') {
    throw new HttpException(
      503,
      `Automatic account creation is only available on testnet (current network: ${network})`,
      'ACCOUNT_CREATION_DISABLED'
    );
  }

  const pending = inFlight.get(address);
  if (pending) return pending;

  const request = createWithFriendbot(address).finally(() => inFlight.delete(address));
  inFlight.set(address, request);
  return request;
}

async function createWithFriendbot(address: string): Promise<string | null> {
  if (await existsOnNetwork(address)) return null;

  const response = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(address)}`);
  const body = (await response.json().catch(() => ({}))) as { hash?: string; detail?: string };

  if (!response.ok) {
    // Friendbot responds 400 if the account already exists (for example,
    // another backend instance created it between the check and the request).
    if (await existsOnNetwork(address)) return null;
    throw new Error(`Friendbot could not create ${address}: ${response.status} ${body.detail ?? ''}`.trim());
  }

  logger.info({ address, hash: body.hash }, 'Created user account on testnet with Friendbot');
  return body.hash ?? null;
}
