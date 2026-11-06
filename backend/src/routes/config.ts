import { Router, Request, Response } from 'express';

import { successResponse } from '@/utils/formatting';
import * as OnChainEnvService from '@/services/onchain/OnChainEnvService';

const router = Router();

/**
 * GET /api/config/stellar
 *
 * Lo que el frontend necesita para firmar contra la red correcta y armar los
 * enlaces al explorador.
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
