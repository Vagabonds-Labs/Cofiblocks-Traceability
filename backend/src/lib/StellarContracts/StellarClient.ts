import { Horizon, Keypair, NotFoundError, rpc } from '@stellar/stellar-sdk';

import { getDeployment, NetworkDeployment } from './deployments';

/**
 * Punto único de acceso a la red: RPC de Soroban, Horizon y la cuenta con la
 * que el backend firma (asignación de roles, fee-bumps y creación de cuentas).
 */
export class StellarClient {
	public readonly network: string;
	public readonly deployment: NetworkDeployment;
	public readonly networkPassphrase: string;
	public readonly rpc: rpc.Server;

	private static horizonServer: Horizon.Server | null = null;
	private static readSource: string | null = null;

	constructor(network?: string) {
		// `||` y no `??`: una variable definida pero vacía en el .env tiene que caer
		// en el default, no quedar como string vacío.
		this.network = network || process.env.STELLAR_NETWORK || 'mainnet';
		this.deployment = getDeployment(this.network);
		this.networkPassphrase = this.deployment.networkPassphrase;
		this.rpc = new rpc.Server(process.env.STELLAR_RPC_URL || this.deployment.rpcUrl);
	}

	/**
	 * Cuenta del backend. Paga los fees vía fee-bump, crea las cuentas de los
	 * usuarios y es el admin del contrato.
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
	 * Source account para simular lecturas.
	 *
	 * La simulación no valida la secuencia ni exige que la cuenta exista, así que
	 * cualquier clave pública sirve. Usar una efímera evita que leer un balance o
	 * un producto dependa de tener `STELLAR_ADMIN_SECRET` configurada.
	 */
	public getReadSourceAddress(): string {
		if (!StellarClient.readSource) {
			StellarClient.readSource = Keypair.random().publicKey();
		}
		return StellarClient.readSource;
	}

	/**
	 * La cuenta tal como la ve Horizon, o `null` si no existe en la red.
	 *
	 * Sólo un 404 significa "no existe". Cualquier otro error — Horizon caído,
	 * una URL mal configurada — se propaga en vez de disfrazarse de cuenta
	 * inexistente.
	 */
	public async loadAccountOrNull(address: string): Promise<Horizon.AccountResponse | null> {
		try {
			return await this.getHorizon().loadAccount(address);
		} catch (error) {
			if (error instanceof NotFoundError) return null;
			throw error;
		}
	}

	/** Horizon hace falta para balances clásicos y trustlines; el RPC no los expone. */
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
