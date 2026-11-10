import { Express } from 'express';
import { webhookCallback } from 'grammy';

import { logger } from '@/lib/logger';
import { createBot } from './bot';

export const TELEGRAM_WEBHOOK_PATH = '/api/telegram/webhook';

/**
 * Arranca el bot de los caficultores, si está configurado.
 *
 * - Sin `TELEGRAM_BOT_TOKEN` el bot queda apagado y el resto del backend
 *   funciona igual.
 * - Con `TELEGRAM_WEBHOOK_URL` (producción/staging) Telegram le manda los
 *   mensajes a `POST /api/telegram/webhook`, firmados con
 *   `TELEGRAM_WEBHOOK_SECRET`.
 * - Sin webhook (desarrollo local) el bot hace long polling.
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

  // Long polling: si quedó un webhook de otro entorno, Telegram no entrega
  // updates por polling hasta que se borra.
  await bot.api.deleteWebhook();
  bot.start({ onStart: (info) => logger.info(`Telegram bot @${info.username} polling for updates`) });
}
