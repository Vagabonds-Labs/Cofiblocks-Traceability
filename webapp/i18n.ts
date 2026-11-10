import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

// Afaan Oromoo (om) and Amharic (am) are the languages of the Ethiopia pilot.
export type Locale = 'en' | 'es' | 'om' | 'am';
export const locales: Locale[] = ['en', 'es', 'om', 'am'];

export const defaultLocale = 'en' as const;

export default getRequestConfig(async ({ requestLocale }) => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get('cofiblocks-language')?.value;
  const locale = cookieLocale || (await requestLocale) || defaultLocale;

  const validLocale = locales.includes(locale as any)
    ? locale
    : defaultLocale;

  return {
    locale: validLocale,
    messages: (await import(`./locales/${validLocale}.json`)).default
  };
});
