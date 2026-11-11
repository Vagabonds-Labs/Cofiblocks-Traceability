import { Asset, BASE_FEE, Horizon, Operation, TransactionBuilder } from '@stellar/stellar-sdk';

import { HttpException } from '@/exceptions/HttpException';
import { ContractFactory, StellarClient } from '@/lib/StellarContracts';
import { withAccountLock } from '@/lib/StellarContracts/utils';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

const contractFactory = new ContractFactory();

const FRIENDBOT_URL = 'https://friendbot.stellar.org';

/** Testnet XLM sent to each staff wallet, once. */
const FAUCET_AMOUNT_XLM = process.env.FAUCET_AMOUNT_XLM || '10';

/** Below this balance the faucet tops itself up with Friendbot (10,000 XLM). */
const FAUCET_REFILL_BELOW_XLM = 1000;

/** How long a faucet payment stays valid. After that it can no longer land. */
const PAYMENT_VALIDITY_SECONDS = 60;

export interface FundingResult {
  tx_hash: string;
  funded_at: Date;
  already_funded: boolean;
}

function requireTestnet() {
  const network = contractFactory.getClient().network;
  if (network !== 'testnet') {
    throw new HttpException(503, `The faucet only runs on testnet (current network: ${network})`, 'FAUCET_DISABLED');
  }
}

function nativeBalance(account: Horizon.AccountResponse): number {
  const native = account.balances.find((balance) => balance.asset_type === 'native');
  return native ? Number(native.balance) : 0;
}

/** A payment is in flight: retryable, so the client should try again shortly. */
function pending(): HttpException {
  return new HttpException(409, 'Funding is in progress. Try again in a minute.', 'FUNDING_IN_PROGRESS');
}

async function refillIfLow(faucetAddress: string) {
  const account = await contractFactory.getClient().loadAccountOrNull(faucetAddress);
  if (account && nativeBalance(account) >= FAUCET_REFILL_BELOW_XLM) return;
  const response = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(faucetAddress)}`);
  logger.info({ faucetAddress, status: response.status }, 'Faucet topped up with Friendbot');
}

async function markFunded(userId: string, hash: string): Promise<Date> {
  const fundedAt = new Date();
  await prisma.user.update({ where: { id: userId }, data: { fundTx: hash, fundedAt, fundTxValidUntil: null } });
  return fundedAt;
}

/**
 * Sends testnet XLM to the user's wallet, once per user.
 *
 * The account has to exist already: Cavos creates it (see the web app), and
 * creating it here first would leave the user waiting to approve their device.
 *
 * Exactly-once without a queue:
 * - the payment is built and signed first, so its hash and expiry are known;
 * - the user row is then claimed atomically by storing that hash, only if no
 *   other request stored one (or the stored one expired without landing);
 * - if the outcome of a payment is unknown (a timeout, a crash), the claim is
 *   kept: a payment that does not show up yet may still land. The next
 *   request looks the stored hash up on Horizon, and only pays again once that
 *   payment has surely expired without landing.
 */
export async function fundUser(userId: string): Promise<FundingResult> {
  requireTestnet();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.walletAddress) {
    throw new HttpException(400, 'The user has no Stellar account', 'USER_WITHOUT_WALLET');
  }
  if (user.fundedAt && user.fundTx) {
    return { tx_hash: user.fundTx, funded_at: user.fundedAt, already_funded: true };
  }

  const client = contractFactory.getClient();

  // A previous request may have submitted a payment that we never confirmed.
  if (user.fundTx) {
    const outcome = await client.getTransactionOutcome(user.fundTx);
    if (outcome === 'success') {
      return { tx_hash: user.fundTx, funded_at: await markFunded(user.id, user.fundTx), already_funded: true };
    }
    if (outcome === 'unknown' && !StellarClient.hasSurelyExpired(user.fundTxValidUntil)) {
      throw pending();
    }
  }

  if (!(await client.loadAccountOrNull(user.walletAddress))) {
    throw new HttpException(409, 'The Stellar account does not exist yet', 'ACCOUNT_NOT_DEPLOYED');
  }

  const faucet = client.getFaucetKeypair();
  return withAccountLock(faucet.publicKey(), async () => {
    await refillIfLow(faucet.publicKey());
    const source = await client.rpc.getAccount(faucet.publicKey());
    const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: client.networkPassphrase })
      .addOperation(
        Operation.payment({ destination: user.walletAddress!, asset: Asset.native(), amount: FAUCET_AMOUNT_XLM })
      )
      .setTimeout(PAYMENT_VALIDITY_SECONDS)
      .build();
    tx.sign(faucet);
    const hash = Buffer.from(tx.hash()).toString('hex');

    const { count } = await prisma.user.updateMany({
      where: { id: user.id, fundedAt: null, fundTx: user.fundTx },
      data: { fundTx: hash, fundTxValidUntil: new Date(Number(tx.timeBounds!.maxTime) * 1000) },
    });
    if (count === 0) throw pending();

    try {
      await contractFactory.getTxSubmitter().submitAsService(tx);
    } catch (error) {
      const outcome = await client.getTransactionOutcome(hash).catch(() => 'unknown' as const);
      if (outcome === 'success') {
        // It landed after all (e.g. the confirmation poll timed out).
        return { tx_hash: hash, funded_at: await markFunded(user.id, hash), already_funded: false };
      }
      if (outcome === 'failed') {
        // It surely did not move funds: release the claim so it can be retried.
        await prisma.user.updateMany({
          where: { id: user.id, fundTx: hash, fundedAt: null },
          data: { fundTx: null, fundTxValidUntil: null },
        });
        throw error;
      }
      // Unknown: it may still land. Keep the claim; the next request reconciles it.
      logger.warn({ error, userId: user.id, hash }, 'Faucet payment outcome unknown, keeping it pending');
      throw pending();
    }

    const fundedAt = await markFunded(user.id, hash);
    logger.info({ userId: user.id, address: user.walletAddress, hash }, 'Funded user wallet from the faucet');
    return { tx_hash: hash, funded_at: fundedAt, already_funded: false };
  });
}

/** Records the Friendbot transaction that created an own-wallet account. */
export async function recordFriendbotFunding(userId: string, hash: string): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, fundedAt: null },
    data: { fundTx: hash, fundedAt: new Date(), fundTxValidUntil: null },
  });
}

/** Address of the faucet account, or `null` if it is not configured. */
export function getFaucetAddress(): string | null {
  try {
    return contractFactory.getClient().getFaucetKeypair().publicKey();
  } catch {
    return null;
  }
}

export interface WalletInfo {
  address: string;
  provider: string | null;
  exists: boolean;
  balance_xlm: string | null;
  funded_at: Date | null;
  fund_tx: string | null;
}

/** The user's Stellar account as the network sees it, plus its funding. */
export async function getWalletInfo(userId: string): Promise<WalletInfo> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.walletAddress) {
    throw new HttpException(400, 'The user has no Stellar account', 'USER_WITHOUT_WALLET');
  }
  const account = await contractFactory.getClient().loadAccountOrNull(user.walletAddress);
  return {
    address: user.walletAddress,
    provider: user.walletProvider,
    exists: account !== null,
    balance_xlm: account ? account.balances.find((b) => b.asset_type === 'native')?.balance ?? '0' : null,
    funded_at: user.fundedAt,
    fund_tx: user.fundedAt ? user.fundTx : null,
  };
}
