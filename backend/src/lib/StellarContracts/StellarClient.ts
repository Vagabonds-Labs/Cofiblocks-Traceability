import { Horizon, Keypair, NotFoundError, rpc } from '@stellar/stellar-sdk';

import { getDeployment, NetworkDeployment } from './deployments';

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
