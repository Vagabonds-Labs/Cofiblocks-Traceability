import { Bot, Context, InlineKeyboard } from 'grammy';

import { logger } from '@/lib/logger';
import * as FarmersService from '@/services/app/FarmersService';
import * as OrganizationsService from '@/services/app/OrganizationsService';
import { Conversation, getConversation, saveConversation } from './conversation';
import { BOT_LANGUAGES, t } from './messages';

/** Después de tantos IDs inválidos seguidos, el bot deriva a la cooperativa. */
const MAX_FAILED_ATTEMPTS = 5;

function chatIdOf(ctx: Context): bigint | null {
  return ctx.chat ? BigInt(ctx.chat.id) : null;
}

function languageKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const language of BOT_LANGUAGES) {
    keyboard.text(language.label, `lang:${language.code}`).row();
  }
  return keyboard;
}

async function askLanguage(ctx: Context, chatId: bigint) {
  await saveConversation(chatId, { step: 'CHOOSE_LANGUAGE', data: {} });
  await ctx.reply(t('en', 'chooseLanguage'), { reply_markup: languageKeyboard() });
}

async function askCooperative(ctx: Context, chatId: bigint, language: string | null) {
  const coops = await OrganizationsService.listCooperatives();
  if (coops.length === 0) {
    await ctx.reply(t(language, 'noCoops'));
    return;
  }
  const keyboard = new InlineKeyboard();
  for (const coop of coops) {
    keyboard.text(coop.name, `coop:${coop.code}`).row();
  }
  await saveConversation(chatId, { step: 'CHOOSE_COOP', data: {} });
  await ctx.reply(t(language, 'chooseCoop'), { reply_markup: keyboard });
}

/** Saludo para un caficultor ya vinculado. Devuelve `false` si no lo está. */
async function greetLinkedFarmer(ctx: Context, conversation: Conversation | null): Promise<boolean> {
  if (!ctx.from) return false;
  const farmer = await FarmersService.findFarmerByTelegramUser(BigInt(ctx.from.id));
  if (!farmer) return false;
  await ctx.reply(
    t(conversation?.language ?? farmer.language, 'welcomeBack', {
      id: farmer.coopFarmerId,
      coop: farmer.organization.name,
    })
  );
  return true;
}

/**
 * Bot de Telegram de los caficultores.
 *
 * v0 (semana 1): el caficultor elige idioma y cooperativa, escribe su ID y el
 * bot lo valida contra la lista que cargó la cooperativa. Si coincide, queda
 * vinculado a su cuenta de Telegram. El registro completo (datos, parcelas,
 * consentimiento) llega en la semana 2.
 */
export function createBot(token: string): Bot {
  const bot = new Bot(token);

  // Sólo chats privados: en un grupo, cualquiera vería el ID del caficultor.
  bot.use(async (ctx, next) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    await next();
  });

  bot.command('start', async (ctx) => {
    const chatId = chatIdOf(ctx);
    if (chatId === null) return;
    const conversation = await getConversation(chatId);
    if (await greetLinkedFarmer(ctx, conversation)) return;
    await askLanguage(ctx, chatId);
  });

  bot.command('language', async (ctx) => {
    const chatId = chatIdOf(ctx);
    if (chatId === null) return;
    const conversation = await getConversation(chatId);
    // Cambiar el idioma no reinicia un registro ya vinculado.
    await saveConversation(chatId, {
      step: conversation?.step === 'LINKED' ? 'LINKED' : 'CHOOSE_LANGUAGE',
    });
    await ctx.reply(t(conversation?.language, 'chooseLanguage'), { reply_markup: languageKeyboard() });
  });

  bot.command('help', async (ctx) => {
    const chatId = chatIdOf(ctx);
    const conversation = chatId === null ? null : await getConversation(chatId);
    await ctx.reply(t(conversation?.language, 'help'));
  });

  bot.callbackQuery(/^lang:(\w+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatId = chatIdOf(ctx);
    if (chatId === null) return;
    const language = ctx.match[1];
    const conversation = await getConversation(chatId);
    await saveConversation(chatId, { language });
    if (conversation?.step === 'LINKED') {
      await greetLinkedFarmer(ctx, { ...conversation, language });
      return;
    }
    await askCooperative(ctx, chatId, language);
  });

  bot.callbackQuery(/^coop:([A-Z0-9]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatId = chatIdOf(ctx);
    if (chatId === null) return;
    const conversation = await getConversation(chatId);
    const coop = await OrganizationsService.findCooperativeByCode(ctx.match[1]);
    if (!coop) {
      await askCooperative(ctx, chatId, conversation?.language ?? null);
      return;
    }
    await saveConversation(chatId, { step: 'ENTER_ID', data: { coopCode: coop.code, failedAttempts: 0 } });
    await ctx.reply(t(conversation?.language, 'enterId', { coop: coop.name }));
  });

  bot.on('message:text', async (ctx) => {
    const chatId = chatIdOf(ctx);
    if (chatId === null) return;
    const conversation = await getConversation(chatId);
    const language = conversation?.language ?? null;

    if (!conversation) {
      await askLanguage(ctx, chatId);
      return;
    }
    if (conversation.step === 'LINKED') {
      await greetLinkedFarmer(ctx, conversation);
      return;
    }
    if (conversation.step !== 'ENTER_ID' || !conversation.data.coopCode) {
      await ctx.reply(t(language, 'useButtons'));
      return;
    }

    const coop = await OrganizationsService.findCooperativeByCode(conversation.data.coopCode);
    if (!coop) {
      await askCooperative(ctx, chatId, language);
      return;
    }

    const typedId = FarmersService.normalizeFarmerId(ctx.message.text);
    const result = await FarmersService.linkTelegram({
      organizationId: coop.id,
      coopFarmerId: typedId,
      telegramUserId: BigInt(ctx.from.id),
      telegramUsername: ctx.from.username ?? null,
      language,
    });

    if (result.ok) {
      await saveConversation(chatId, { step: 'LINKED', farmerId: result.farmerId, data: {} });
      await ctx.reply(t(language, 'linked', { coop: coop.name, id: typedId }));
      return;
    }

    if (result.reason === 'NOT_FOUND') {
      const failedAttempts = (conversation.data.failedAttempts ?? 0) + 1;
      await saveConversation(chatId, { data: { ...conversation.data, failedAttempts } });
      await ctx.reply(
        failedAttempts >= MAX_FAILED_ATTEMPTS
          ? t(language, 'tooManyAttempts')
          : t(language, 'notFound', { id: typedId, coop: coop.name })
      );
      return;
    }
    await ctx.reply(
      result.reason === 'LINKED_TO_OTHER_ACCOUNT'
        ? t(language, 'linkedToOtherAccount', { id: typedId })
        : t(language, 'telegramAlreadyRegistered')
    );
  });

  // Fotos, audios, ubicación: todavía no se usan en la v0.
  bot.on('message', async (ctx) => {
    const chatId = chatIdOf(ctx);
    const conversation = chatId === null ? null : await getConversation(chatId);
    await ctx.reply(t(conversation?.language, 'useButtons'));
  });

  bot.catch(async (error) => {
    logger.error({ error: error.error, update: error.ctx.update.update_id }, 'Telegram bot error');
    try {
      await error.ctx.reply(t('en', 'error'));
    } catch {
      // Si ni siquiera se puede responder, ya quedó en el log.
    }
  });

  return bot;
}
