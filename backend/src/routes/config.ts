import { Router, Request, Response } from 'express';

import { successResponse } from '@/utils/formatting';
import * as OnChainEnvService from '@/services/onchain/OnChainEnvService';

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
  });
});

export default router;
