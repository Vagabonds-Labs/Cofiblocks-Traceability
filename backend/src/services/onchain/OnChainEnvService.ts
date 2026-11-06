import { ContractFactory } from '@/lib/StellarContracts';

const contractFactory = new ContractFactory();

export function getNetwork() {
  return contractFactory.getNetwork();
}

export function getTraceabilityAddress() {
  return contractFactory.getTraceabilityService().contractAddress;
}

export function getNetworkPassphrase() {
  return contractFactory.getClient().networkPassphrase;
}

export function getRpcUrl() {
  return contractFactory.getClient().deployment.rpcUrl;
}

/** Base del explorador de bloques (Stellar Expert) para la red actual. */
export function getExplorerBaseURL() {
  const network = getNetwork() === 'mainnet' ? 'public' : 'testnet';
  return `https://stellar.expert/explorer/${network}`;
}
