/**
 * Textos del bot en inglés, Afaan Oromoo y amárico.
 *
 * Las traducciones a oromo y amárico son un primer borrador: el equipo local
 * tiene que revisarlas antes del piloto. Si falta una clave, cae en inglés.
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

const om: Record<MessageKey, string> = {
  chooseLanguage: 'Baga gara CofiBlocks dhuftan ☕\nMaaloo afaan keessan filadhaa.',
  chooseCoop: 'Buna keessan waldaa hojii gamtaa kamiif dhiyeessitu?',
  enterId: 'Maaloo ID qonnaan bulaa {coop} isiniif kenne barreessaa.',
  linked:
    'Akkam! Qonnaan bulaa {coop} ta\'uun ID {id}n galmooftaniittu. ✅\n\n' +
    'Yeroo dhihootti piroofaayilii keessan guutuu, lafa qonnaa keessan dabaluu fi buna keessan asii hordofuu ni dandeessu.',
  welcomeBack: 'Baga deebitan, qonnaan bulaa {id} kan {coop}! ☕',
  notFound:
    'ID {id} {coop} keessatti hin arganne. Maaloo ilaalaatii irra deebi\'aa barreessaa, ' +
    'ykn waldaa hojii gamtaa biraa filachuuf /start ergaa.',
  tooManyAttempts:
    'Yaalii hedduu booda ID keessan mirkaneessuu hin dandeenye. Maaloo akka isin gargaaraniif waldaa hojii gamtaa keessan quunnamaa.',
  linkedToOtherAccount:
    'ID {id} duraan herrega Telegram biraa wajjin walqabateera. Maaloo waldaa hojii gamtaa keessan quunnamaa.',
  telegramAlreadyRegistered:
    'Herregni Telegram kun duraan qonnaan bulaa biraatiin galmaa\'eera. Maaloo waldaa hojii gamtaa keessan quunnamaa.',
  useButtons: 'Maaloo qabduuwwan armaan olii fayyadamaa, ykn haaraatti jalqabuuf /start ergaa.',
  help:
    'CofiBlocks buna keessan giddu-gala walitti qabaa irraa hanga gurgurtaatti akka hordoftan isin gargaara.\n\n' +
    '/start – jalqabi ykn galmee kee ilaali\n/language – afaan jijjiiri\n/help – ergaa kana',
  noCoops: 'Galmeen ammallee hin banamne. Maaloo booda irra deebi\'aa yaalaa.',
  error: 'Nu biratti rakkoon uumameera. Maaloo daqiiqaa muraasa booda irra deebi\'aa yaalaa.',
};

const am: Record<MessageKey, string> = {
  chooseLanguage: 'እንኳን ወደ CofiBlocks በደህና መጡ ☕\nእባክዎ ቋንቋዎን ይምረጡ።',
  chooseCoop: 'ቡናዎን ለየትኛው ኅብረት ሥራ ማኅበር ያስረክባሉ?',
  enterId: 'እባክዎ {coop} የሰጠዎትን የአርሶ አደር መለያ ቁጥር ይጻፉ።',
  linked:
    'ሰላም! በ{id} መለያ ቁጥር የ{coop} አርሶ አደር ሆነው ተመዝግበዋል። ✅\n\n' +
    'በቅርቡ መገለጫዎን ማሟላት፣ ማሳዎችዎን መጨመር እና ቡናዎን ከዚህ መከታተል ይችላሉ።',
  welcomeBack: 'እንኳን ደህና መጡ፣ የ{coop} አርሶ አደር {id}! ☕',
  notFound:
    'መለያ ቁጥር {id}ን በ{coop} ውስጥ ማግኘት አልቻልንም። እባክዎ አረጋግጠው እንደገና ይጻፉ፣ ' +
    'ወይም ሌላ ማኅበር ለመምረጥ /start ይላኩ።',
  tooManyAttempts: 'ከበርካታ ሙከራዎች በኋላ መለያ ቁጥርዎን ማረጋገጥ አልቻልንም። እንዲረዱዎት እባክዎ ማኅበርዎን ያነጋግሩ።',
  linkedToOtherAccount: 'መለያ ቁጥር {id} ቀድሞ ከሌላ የTelegram መለያ ጋር ተገናኝቷል። እባክዎ ማኅበርዎን ያነጋግሩ።',
  telegramAlreadyRegistered: 'ይህ የTelegram መለያ ቀድሞ እንደ ሌላ አርሶ አደር ተመዝግቧል። እባክዎ ማኅበርዎን ያነጋግሩ።',
  useButtons: 'እባክዎ ከላይ ያሉትን ቁልፎች ይጠቀሙ፣ ወይም እንደገና ለመጀመር /start ይላኩ።',
  help:
    'CofiBlocks ቡናዎን ከመሰብሰቢያ ማዕከል እስከ ሽያጭ እንዲከታተሉ ይረዳዎታል።\n\n' +
    '/start – ይጀምሩ ወይም ምዝገባዎን ይመልከቱ\n/language – ቋንቋ ይቀይሩ\n/help – ይህ መልዕክት',
  noCoops: 'ምዝገባው ገና አልተከፈተም። እባክዎ ቆይተው እንደገና ይሞክሩ።',
  error: 'በእኛ በኩል ችግር ተፈጥሯል። እባክዎ ከጥቂት ደቂቃዎች በኋላ እንደገና ይሞክሩ።',
};

const MESSAGES: Partial<Record<BotLanguage, Partial<Record<MessageKey, string>>>> = { en, om, am };

/**
 * Pregunta por el idioma en los tres idiomas: todavía no sabemos cuál lee el
 * caficultor.
 */
export function chooseLanguagePrompt(): string {
  return BOT_LANGUAGES.map((language) => t(language.code, 'chooseLanguage')).join('\n\n');
}

export function t(language: string | null | undefined, key: MessageKey, vars: Record<string, string> = {}): string {
  const table = MESSAGES[(language ?? 'en') as BotLanguage] ?? {};
  const template = table[key] ?? en[key];
  return template.replace(/\{(\w+)\}/g, (match, name: string) => vars[name] ?? match);
}
