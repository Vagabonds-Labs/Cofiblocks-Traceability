import { HttpException } from '@/exceptions/HttpException';
import { ContractFactory } from '@/lib/StellarContracts';
import { isClassicAddress } from '@/lib/StellarContracts/utils';
import { logger } from '@/lib/logger';

const contractFactory = new ContractFactory();

const FRIENDBOT_URL = 'https://friendbot.stellar.org';

/** `true` si la cuenta ya existe en la red. */
export async function existsOnNetwork(address: string): Promise<boolean> {
  return (await contractFactory.getClient().loadAccountOrNull(address)) !== null;
}

/**
 * Altas en curso, por dirección. Evita pedir dos veces la misma cuenta cuando
 * el usuario entra dos veces seguidas. Es por proceso: no reemplaza el estado
 * persistido del faucet (`fundedAt`/`fundTx`), que llega con `POST /wallet/fund`.
 */
const inFlight = new Map<string, Promise<string | null>>();

/**
 * Crea la cuenta del usuario si todavía no existe.
 *
 * Hace falta porque las transacciones que firma el usuario lo usan como source
 * account. Sólo funciona en **testnet**, y la crea Friendbot: el backend no
 * gasta saldo propio. Antes la fondeaba la cuenta admin con 1 XLM, y como
 * cualquiera puede generar claves y entrar, cualquiera podía vaciarla; en
 * mainnet habría gastado fondos reales.
 *
 * En otra red no crea nada: para eso hace falta un faucet con presupuesto y
 * límites, que todavía no existe.
 *
 * Devuelve el hash de la transacción, o `null` si la cuenta ya existía.
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
    // Friendbot responde 400 si la cuenta ya existe (por ejemplo, la creó otra
    // instancia del backend entre la consulta y el pedido).
    if (await existsOnNetwork(address)) return null;
    throw new Error(`Friendbot could not create ${address}: ${response.status} ${body.detail ?? ''}`.trim());
  }

  logger.info({ address, hash: body.hash }, 'Created user account on testnet with Friendbot');
  return body.hash ?? null;
}
