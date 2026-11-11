import { Router, Request, Response } from 'express';

import { authenticate } from '@/middleware';
import * as FaucetService from '@/services/onchain/FaucetService';
import { successResponse } from '@/utils/formatting';

const router = Router();

/** GET /api/wallet — the user's Stellar account: existence, XLM balance and funding. */
router.get('/', authenticate, async (req: Request, res: Response) => {
  const wallet = await FaucetService.getWalletInfo(req.user!.userId);
  successResponse(res, { wallet }, 'Wallet retrieved successfully', 200);
});

/**
 * POST /api/wallet/fund — sends testnet XLM to the user's account, once.
 * The account must already exist (`409 ACCOUNT_NOT_DEPLOYED` otherwise).
 */
router.post('/fund', authenticate, async (req: Request, res: Response) => {
  const funding = await FaucetService.fundUser(req.user!.userId);
  successResponse(res, { funding }, funding.already_funded ? 'Wallet already funded' : 'Wallet funded', 200);
});

export default router;
