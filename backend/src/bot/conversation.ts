import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';

/** Pasos del flujo del bot. Se guardan como texto en `BotConversation.step`. */
export type BotStep = 'CHOOSE_LANGUAGE' | 'CHOOSE_COOP' | 'ENTER_ID' | 'LINKED';

export interface ConversationData {
  coopCode?: string;
  failedAttempts?: number;
}

export interface Conversation {
  chatId: bigint;
  farmerId: string | null;
  language: string | null;
  step: BotStep;
  data: ConversationData;
}

export async function getConversation(chatId: bigint): Promise<Conversation | null> {
  const row = await prisma.botConversation.findUnique({ where: { chatId } });
  if (!row) return null;
  return {
    chatId: row.chatId,
    farmerId: row.farmerId,
    language: row.language,
    step: row.step as BotStep,
    data: (row.data ?? {}) as ConversationData,
  };
}

export async function saveConversation(
  chatId: bigint,
  update: Partial<Omit<Conversation, 'chatId'>>
): Promise<void> {
  const data = update.data as Prisma.InputJsonValue | undefined;
  await prisma.botConversation.upsert({
    where: { chatId },
    create: {
      chatId,
      step: update.step ?? 'CHOOSE_LANGUAGE',
      language: update.language ?? null,
      farmerId: update.farmerId ?? null,
      data: data ?? {},
    },
    update: {
      ...(update.step !== undefined && { step: update.step }),
      ...(update.language !== undefined && { language: update.language }),
      ...(update.farmerId !== undefined && { farmerId: update.farmerId }),
      ...(data !== undefined && { data }),
    },
  });
}
