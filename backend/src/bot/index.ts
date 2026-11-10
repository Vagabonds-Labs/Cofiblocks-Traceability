import { Express } from 'express';
import { webhookCallback } from 'grammy';

import { logger } from '@/lib/logger';
import { createBot } from './bot';

export const TELEGRAM_WEBHOOK_PATH = '/api/telegram/webhook';

/**
 * Starts the farmers' bot, if it is configured.
 *
 * Prototype from week 0: VoiceLedger now builds the farmer bot, so this one
 * stays off in practice.
 *
 * - Without `TELEGRAM_BOT_TOKEN` the bot stays off and the rest of the backend
 *   works the same.
 * - With `TELEGRAM_WEBHOOK_URL` (production/staging) Telegram sends the
 *   messages to `POST /api/telegram/webhook`, signed with
 *   `TELEGRAM_WEBHOOK_SECRET`.
 * - Without a webhook (local development) the bot uses long polling.
 */
export async function startTelegramBot(app: Express): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.info('TELEGRAM_BOT_TOKEN is not set: the Telegram bot is disabled');
    return;
  }

  const bot = createBot(token);
  await bot.api.setMyCommands([
    { command: 'start', description: 'Begin or check your registration' },
    { command: 'language', description: 'Change language' },
    { command: 'help', description: 'Help' },
  ]);

  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
  if (webhookUrl) {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error('TELEGRAM_WEBHOOK_SECRET is required when TELEGRAM_WEBHOOK_URL is set');
    }
    app.post(TELEGRAM_WEBHOOK_PATH, webhookCallback(bot, 'express', { secretToken: secret }));
    await bot.api.setWebhook(webhookUrl, { secret_token: secret });
    logger.info({ webhookUrl }, 'Telegram bot listening via webhook');
    return;
  }

  // Long polling: if a webhook from another environment is still set,
  // Telegram does not deliver updates by polling until it is deleted.
  await bot.api.deleteWebhook();
  bot.start({ onStart: (info) => logger.info(`Telegram bot @${info.username} polling for updates`) });
}
