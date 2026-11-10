/**
 * Direcciones de los contratos por red.
 *
 * Se sincroniza a mano desde `contracts/deployments/<network>.json`, que emite
 * `contracts/scripts/deploy.sh`. `STELLAR_TRACEABILITY_ADDRESS` pisa la
 * dirección de cualquier red (útil para probar un despliegue nuevo sin tocar
 * el código).
 */
import { StellarContract } from './types/contracts';

export interface ContractEntry {
  contract: string;
  address: string;
}

export interface NetworkDeployment {
  network: string;
  networkPassphrase: string;
  rpcUrl: string;
  Traceability: ContractEntry;
}

const deployments: Record<string, NetworkDeployment> = {
  testnet: {
    network: 'testnet',
    networkPassphrase: 'Test SDF Network ; September 2015',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    Traceability: {
      contract: 'Traceability',
      address: 'CAFZUGHOGCYW2ULV4ZN62T5EC7IPYZXTBKVCA3QUKO3QWJHQ5X6KB32Z',
    },
  },
  mainnet: {
    network: 'mainnet',
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
    rpcUrl: 'https://mainnet.sorobanrpc.com',
    Traceability: {
      contract: 'Traceability',
      address: '',
    },
  },
};

export function getDeployment(network: string): NetworkDeployment {
  const deployment = deployments[network];
  if (!deployment) {
    throw new Error(`Unknown Stellar network: ${network}`);
  }
  return deployment;
}

export function getContractAddress(network: string, contract: StellarContract): string {
  const override =
    contract === StellarContract.TRACEABILITY ? process.env.STELLAR_TRACEABILITY_ADDRESS : undefined;
  const address = override || getDeployment(network)[contract].address;
  if (!address) {
    throw new Error(`No address configured for ${contract} on ${network}`);
  }
  return address;
}

export default deployments;
