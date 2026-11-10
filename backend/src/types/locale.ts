/** Idiomas de la app: inglés, español, Afaan Oromoo y amárico. */
export const LOCALES = ['en', 'es', 'om', 'am'] as const;

export type Locale = (typeof LOCALES)[number];
