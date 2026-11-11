import { createHmac, timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';

import { HttpException } from '@/exceptions/HttpException';

declare global {
  namespace Express {
    interface Request {
      /** The exact bytes of the body, kept for signature checks (see `index.ts`). */
      rawBody?: Buffer;
    }
  }
}

export const VOICELEDGER_TIMESTAMP_HEADER = 'x-voiceledger-timestamp';
export const VOICELEDGER_SIGNATURE_HEADER = 'x-voiceledger-signature';

/** Messages older (or further in the future) than this are rejected. */
export const VOICELEDGER_MAX_SKEW_SECONDS = 5 * 60;

/**
 * `sha256=<hex>` of `HMAC-SHA256(secret, "<timestamp>.<raw body>")`.
 *
 * Same scheme as Stripe's webhooks: the timestamp is part of what is signed,
 * so a captured message cannot be replayed once it is stale.
 */
export function signVoiceLedgerPayload(secret: string, timestamp: string, body: Buffer | string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(`${timestamp}.`);
  hmac.update(body);
  return `sha256=${hmac.digest('hex')}`;
}

/**
 * Authenticates a request from VoiceLedger.
 *
 * It proves the message comes from VoiceLedger and was not altered or
 * replayed late. It does not prove that the farmer behind a Telegram account
 * owns the cooperative ID they typed: that is agreed with the cooperative.
 */
export function verifyVoiceLedgerSignature(req: Request, _res: Response, next: NextFunction) {
  const secret = process.env.VOICELEDGER_WEBHOOK_SECRET;
  if (!secret) {
    return next(new HttpException(503, 'The VoiceLedger integration is not configured', 'INTEGRATION_DISABLED'));
  }

  const timestamp = req.header(VOICELEDGER_TIMESTAMP_HEADER);
  const signature = req.header(VOICELEDGER_SIGNATURE_HEADER);
  if (!timestamp || !signature) {
    return next(new HttpException(401, 'Missing VoiceLedger signature headers', 'MISSING_SIGNATURE'));
  }

  const seconds = Number(timestamp);
  if (!/^\d{1,12}$/.test(timestamp) || Math.abs(Date.now() / 1000 - seconds) > VOICELEDGER_MAX_SKEW_SECONDS) {
    return next(new HttpException(401, 'The signature timestamp is missing or too old', 'STALE_TIMESTAMP'));
  }

  const expected = Buffer.from(signVoiceLedgerPayload(secret, timestamp, req.rawBody ?? Buffer.alloc(0)));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return next(new HttpException(401, 'Invalid VoiceLedger signature', 'INVALID_SIGNATURE'));
  }
  next();
}
