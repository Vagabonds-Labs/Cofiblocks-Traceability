import { Router, Request, Response } from 'express';

import { successResponse } from '@/utils/formatting';
import * as OnChainEnvService from '@/services/onchain/OnChainEnvService';
import * as FaucetService from '@/services/onchain/FaucetService';

const router = Router();

/**
 * GET /api/config/stellar
 *
 * What the frontend needs to sign for the right network and build explorer
 * links.
 */
router.get('/stellar', async (_req: Request, res: Response) => {
  successResponse(res, {
    network: OnChainEnvService.getNetwork(),
    networkPassphrase: OnChainEnvService.getNetworkPassphrase(),
    rpcUrl: OnChainEnvService.getRpcUrl(),
    explorerUrl: OnChainEnvService.getExplorerBaseURL(),
    contracts: {
      traceability: OnChainEnvService.getTraceabilityAddress(),
    },
    // Destination of the 1-stroop payment the web app uses to make Cavos
    // create a new account (see the web app's wallet setup).
    faucetAddress: FaucetService.getFaucetAddress(),
  });
});

export default router;
