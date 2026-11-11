import { Router, Request, Response } from 'express';

import { verifyVoiceLedgerSignature } from '@/middleware/voiceLedgerSignature';
import * as IntegrationService from '@/services/app/IntegrationService';

const router = Router();

/**
 * POST /api/integrations/voiceledger/events
 *
 * One signed event from VoiceLedger's farmer bot. The contract with
 * VoiceLedger is documented in `docs/voiceledger-integration.md`.
 */
router.post('/voiceledger/events', verifyVoiceLedgerSignature, async (req: Request, res: Response) => {
  const { status, body } = await IntegrationService.receiveVoiceLedgerEvent(req.body);
  res.status(status).json(body);
});

/** GET /api/integrations/voiceledger/events/:eventId — status of an event. */
router.get('/voiceledger/events/:eventId', verifyVoiceLedgerSignature, async (req: Request, res: Response) => {
  const { status, body } = await IntegrationService.getVoiceLedgerEvent(req.params.eventId);
  res.status(status).json(body);
});

export default router;
