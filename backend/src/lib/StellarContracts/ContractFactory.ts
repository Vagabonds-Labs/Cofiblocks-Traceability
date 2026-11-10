import { StellarClient } from './StellarClient';
import { TxBuilder } from './TxBuilder';
import { TxSubmitter } from './TxSubmitter';
import { Traceability } from './contracts';

/** Fábrica de servicios de cadena. */
export class ContractFactory {
  private readonly client: StellarClient;

  constructor(network?: string) {
    this.client = new StellarClient(network);
  }

  public getClient(): StellarClient {
    return this.client;
  }

  public getTraceabilityService(): Traceability {
    return new Traceability(this.client);
  }

  public getTxBuilder(): TxBuilder {
    return new TxBuilder(this.client);
  }

  public getTxSubmitter(): TxSubmitter {
    return new TxSubmitter(this.client);
  }

  public getNetwork(): string {
    return this.client.network;
  }
}
