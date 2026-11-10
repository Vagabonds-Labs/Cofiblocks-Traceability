/**
 * Textos del bot.
 *
 * Por ahora sólo hay inglés. Afaan Oromoo y amárico se ofrecen en el selector
 * de idioma, pero caen en inglés hasta que el equipo local entregue las
 * traducciones: basta con agregar sus objetos acá con las mismas claves.
 */
export const BOT_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'om', label: 'Afaan Oromoo' },
  { code: 'am', label: 'አማርኛ' },
] as const;

export type BotLanguage = (typeof BOT_LANGUAGES)[number]['code'];

const en = {
  chooseLanguage: 'Welcome to CofiBlocks ☕\nPlease choose your language.',
  chooseCoop: 'Which cooperative do you deliver your coffee to?',
  enterId: 'Please type the farmer ID that {coop} gave you.',
  linked:
    'Hello! You are registered as a farmer of {coop} with ID {id}. ✅\n\n' +
    'Soon you will be able to complete your profile, add your farm plots and follow your coffee from here.',
  welcomeBack: 'Welcome back, farmer {id} of {coop}! ☕',
  notFound:
    'We could not find the ID {id} in {coop}. Please check it and type it again, ' +
    'or send /start to choose another cooperative.',
  tooManyAttempts:
    'We could not verify your ID after several attempts. Please contact your cooperative so they can help you.',
  linkedToOtherAccount:
    'The ID {id} is already linked to another Telegram account. Please contact your cooperative.',
  telegramAlreadyRegistered:
    'This Telegram account is already registered as another farmer. Please contact your cooperative.',
  useButtons: 'Please use the buttons above, or send /start to begin again.',
  help:
    'CofiBlocks helps you follow your coffee from the collection center to its sale.\n\n' +
    '/start – begin or check your registration\n/language – change language\n/help – this message',
  noCoops: 'Registration is not open yet. Please try again later.',
  error: 'Something went wrong on our side. Please try again in a few minutes.',
};

export type MessageKey = keyof typeof en;

const MESSAGES: Partial<Record<BotLanguage, Partial<Record<MessageKey, string>>>> = { en };

export function t(language: string | null | undefined, key: MessageKey, vars: Record<string, string> = {}): string {
  const table = MESSAGES[(language ?? 'en') as BotLanguage] ?? {};
  const template = table[key] ?? en[key];
  return template.replace(/\{(\w+)\}/g, (match, name: string) => vars[name] ?? match);
}
