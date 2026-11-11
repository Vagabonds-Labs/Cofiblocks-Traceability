import { Asset, BASE_FEE, Horizon, NotFoundError, Operation, TransactionBuilder } from '@stellar/stellar-sdk';

import { HttpException } from '@/exceptions/HttpException';
import { ContractFactory } from '@/lib/StellarContracts';
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

/**
 * Status of a funding transaction on the network: `success`, `failed`, or
 * `unknown` if Horizon has no record of it (not landed yet, or never will).
 */
async function transactionStatus(hash: string): Promise<'success' | 'failed' | 'unknown'> {
  try {
    const tx = await contractFactory.getClient().getHorizon().transactions().transaction(hash).call();
    return tx.successful ? 'success' : 'failed';
  } catch (error) {
    if (error instanceof NotFoundError) return 'unknown';
    throw error;
  }
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
 * - if a request dies after submitting, the next one looks the stored hash up
 *   on Horizon instead of paying again, and only retries once the payment has
 *   expired without landing.
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

  // A previous request may have submitted a payment that we never confirmed.
  if (user.fundTx) {
    const status = await transactionStatus(user.fundTx);
    if (status === 'success') {
      return { tx_hash: user.fundTx, funded_at: await markFunded(user.id, user.fundTx), already_funded: true };
    }
    const expired = !user.fundTxValidUntil || user.fundTxValidUntil.getTime() < Date.now();
    if (status === 'unknown' && !expired) {
      throw new HttpException(409, 'Funding is already in progress. Try again in a minute.', 'FUNDING_IN_PROGRESS');
    }
  }

  const client = contractFactory.getClient();
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
    if (count === 0) {
      throw new HttpException(409, 'Funding is already in progress. Try again in a minute.', 'FUNDING_IN_PROGRESS');
    }

    try {
      await contractFactory.getTxSubmitter().submitAsService(tx);
    } catch (error) {
      // Only release the claim if the payment surely did not land.
      if ((await transactionStatus(hash)) !== 'success') {
        await prisma.user.updateMany({
          where: { id: user.id, fundTx: hash, fundedAt: null },
          data: { fundTx: null, fundTxValidUntil: null },
        });
      }
      throw error;
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
