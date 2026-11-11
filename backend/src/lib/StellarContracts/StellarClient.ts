import { Horizon, Keypair, NotFoundError, rpc } from '@stellar/stellar-sdk';

import { getDeployment, NetworkDeployment } from './deployments';

/** Safety margin after a transaction's `maxTime` before it counts as expired. */
const EXPIRY_MARGIN_MS = 30_000;

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
	 * How a submitted transaction ended, as Horizon sees it.
	 *
	 * `unknown` means Horizon has no record of it: it may still land, or it may
	 * never land. It is NOT a failure. Only after its time bounds have passed
	 * (see `hasSurelyExpired`) can a missing transaction be treated as one that
	 * will never land.
	 */
	public async getTransactionOutcome(hash: string): Promise<'success' | 'failed' | 'unknown'> {
		try {
			const tx = await this.getHorizon().transactions().transaction(hash).call();
			return tx.successful ? 'success' : 'failed';
		} catch (error) {
			if (error instanceof NotFoundError) return 'unknown';
			throw error;
		}
	}

	/**
	 * `true` once a transaction valid until `validUntil` can no longer land.
	 * Ledger close times lag the wall clock slightly, so this waits a margin.
	 */
	public static hasSurelyExpired(validUntil: Date | null): boolean {
		return !!validUntil && validUntil.getTime() + EXPIRY_MARGIN_MS < Date.now();
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
