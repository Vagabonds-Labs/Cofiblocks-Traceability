import { Horizon, Keypair, NotFoundError, rpc } from '@stellar/stellar-sdk';

import { getDeployment, NetworkDeployment } from './deployments';

/** Margin between this server's clock and the ledgers' close times. */
const CLOCK_MARGIN_MS = 5 * 60_000;

export type TransactionOutcome = 'success' | 'failed' | 'pending' | 'never_landed';

/** When a transaction could land: after `notBefore`, up to its `maxTime`. */
export interface ValidityWindow {
	notBefore: Date;
	validUntil: Date;
}

/**
 * Single access point to the network: Soroban RPC, Horizon and the account the
 * backend signs with (role assignment and fee-bumps).
 */
export class StellarClient {
	public readonly network: string;
	public readonly deployment: NetworkDeployment;
	public readonly networkPassphrase: string;
	public readonly rpc: rpc.Server;

	private static horizonServer: Horizon.Server | null = null;
	private static readSource: string | null = null;

	constructor(network?: string) {
		// `||`, not `??`: a variable that is defined but empty in .env must fall
		// back to the default, not stay an empty string. The default is testnet:
		// an incomplete .env must never end up operating with real funds.
		this.network = network || process.env.STELLAR_NETWORK || 'testnet';
		this.deployment = getDeployment(this.network);
		this.networkPassphrase = this.deployment.networkPassphrase;
		this.rpc = new rpc.Server(process.env.STELLAR_RPC_URL || this.deployment.rpcUrl);
	}

	/**
	 * The backend's account. Pays fees via fee-bump and is the contract admin.
	 */
	public getServiceKeypair(): Keypair {
		const secret = process.env.STELLAR_ADMIN_SECRET;
		if (!secret) {
			throw new Error('STELLAR_ADMIN_SECRET is not set');
		}
		return Keypair.fromSecret(secret);
	}

	public getServiceAddress(): string {
		return this.getServiceKeypair().publicKey();
	}

	/**
	 * The farmer agent: the only account the contract accepts for farmer
	 * actions (registration, consent, profile, deliveries). Farmers have no
	 * wallet, so the backend signs for them with this key.
	 */
	public getFarmerAgentKeypair(): Keypair {
		return StellarClient.keypairFromEnv('STELLAR_FARMER_AGENT_SECRET');
	}

	/** The faucet account that sends testnet XLM to new staff wallets. */
	public getFaucetKeypair(): Keypair {
		return StellarClient.keypairFromEnv('STELLAR_FAUCET_SECRET');
	}

	private static keypairFromEnv(name: string): Keypair {
		const secret = process.env[name];
		if (!secret) {
			throw new Error(`${name} is not set`);
		}
		return Keypair.fromSecret(secret);
	}

	/**
	 * Source account for simulating reads.
	 *
	 * Simulation does not check the sequence or require the account to exist,
	 * so any public key works. Using an ephemeral one keeps reads from depending
	 * on `STELLAR_ADMIN_SECRET` being configured.
	 */
	public getReadSourceAddress(): string {
		if (!StellarClient.readSource) {
			StellarClient.readSource = Keypair.random().publicKey();
		}
		return StellarClient.readSource;
	}

	/**
	 * The account as Horizon sees it, or `null` if it does not exist on the
	 * network.
	 *
	 * Only a 404 means "does not exist". Any other error — Horizon down, a
	 * misconfigured URL — is propagated instead of passing for a missing
	 * account.
	 */
	public async loadAccountOrNull(address: string): Promise<Horizon.AccountResponse | null> {
		try {
			return await this.getHorizon().loadAccount(address);
		} catch (error) {
			if (error instanceof NotFoundError) return null;
			throw error;
		}
	}

	/**
	 * How a transaction we submitted ended.
	 *
	 * - `success` / `failed`: the Soroban RPC or Horizon has it.
	 * - `never_landed`: neither has it, and one of them has indexed every ledger
	 *   it could have landed in, from before it was signed to a ledger that
	 *   closed after its `maxTime`. A transaction is only valid in a ledger whose
	 *   close time is at most its `maxTime`, and ledgers are indexed in order, so
	 *   once a later ledger is indexed there is no chance left.
	 * - `pending`: anything else. Not visible yet, a source that is down, or a
	 *   source that lags behind the network: it may have landed or still land.
	 *   Never treat it as a failure.
	 *
	 * The wall clock alone is not enough: a transaction can land before it
	 * expires and show up in an index that is still catching up.
	 */
	public async getTransactionOutcome(hash: string, window: ValidityWindow | null): Promise<TransactionOutcome> {
		const expired = !!window && window.validUntil.getTime() < Date.now();
		const from = window ? window.notBefore.getTime() / 1000 : 0;
		const until = window ? window.validUntil.getTime() / 1000 : 0;

		// Soroban RPC: one response says both "not found" and how far it has indexed.
		try {
			const result = await this.rpc.getTransaction(hash);
			if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) return 'success';
			if (result.status === rpc.Api.GetTransactionStatus.FAILED) return 'failed';
			if (
				expired &&
				Number(result.oldestLedgerCloseTime) <= from &&
				Number(result.latestLedgerCloseTime) > until
			) {
				return 'never_landed';
			}
		} catch {
			// RPC unavailable: no evidence either way. Ask Horizon.
		}

		// Horizon. Its indexing progress is read BEFORE the lookup, so a "not found"
		// covers at least the ledgers that progress reports.
		try {
			const horizon = this.getHorizon();
			// Without its progress Horizon can still confirm the transaction, just not
			// prove its absence.
			const root = expired ? await horizon.root().catch(() => null) : null;
			try {
				const tx = await horizon.transactions().transaction(hash).call();
				return tx.successful ? 'success' : 'failed';
			} catch (error) {
				if (!(error instanceof NotFoundError)) return 'pending';
			}
			if (root && Date.parse(root.history_latest_ledger_closed_at) / 1000 > until) {
				const elder = await horizon.ledgers().ledger(root.history_elder_ledger).call();
				// The SDK types `ledger(n).call()` as a page; it returns a single record.
				if (Date.parse((elder as unknown as { closed_at: string }).closed_at) / 1000 <= from) {
					return 'never_landed';
				}
			}
		} catch {
			// Horizon unavailable: no evidence.
		}
		return 'pending';
	}

	/**
	 * The ledgers a transaction could have landed in. It cannot land before it
	 * was signed (`validUntil - validForSeconds`); the margin absorbs the
	 * difference between this server's clock and the ledgers' close times.
	 */
	public static validityWindow(validUntil: Date | null, validForSeconds: number): ValidityWindow | null {
		if (!validUntil) return null;
		return {
			notBefore: new Date(validUntil.getTime() - validForSeconds * 1000 - CLOCK_MARGIN_MS),
			validUntil,
		};
	}

	/** Horizon is needed for classic balances and trustlines; the RPC does not expose them. */
	public getHorizon(): Horizon.Server {
		if (!StellarClient.horizonServer) {
			const url =
				process.env.STELLAR_HORIZON_URL ||
				(this.network === 'mainnet'
					? 'https://horizon.stellar.org'
					: 'https://horizon-testnet.stellar.org');
			StellarClient.horizonServer = new Horizon.Server(url);
		}
		return StellarClient.horizonServer;
	}
}
