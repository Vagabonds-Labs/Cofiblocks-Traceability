/** App languages: English, Spanish, Afaan Oromoo and Amharic. */
export const LOCALES = ['en', 'es', 'om', 'am'] as const;

export type Locale = (typeof LOCALES)[number];
