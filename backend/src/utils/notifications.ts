import es from '../../locales/es.json';
import en from '../../locales/en.json';

import { Locale } from '@/types/locale';

const LOCALES = { es, en };

/**
 * Get translation value using dot notation
 * @param lang - Language code
 * @param key - Dot-notation key (e.g., "notifications.welcome_message")
 * @returns The translated string or undefined if not found
 */
function t(lang: Locale, key: string): string | undefined {
    return key.split('.').reduce((acc: any, k: string) => acc?.[k], LOCALES[lang]);
  }

/**
 * Format a string with arguments
 * Supports {0}, {1}, {2}, etc. placeholders
 * Example: formatString("Hello {0}, you have {1} messages", ["John", "5"])
 * Returns: "Hello John, you have 5 messages"
 */
function formatString(template: string, args: string[]): string {
    if (!args || args.length === 0) {
      return template;
    }
  
    return template.replace(/\{(\d+)\}/g, (match, index) => {
      const argIndex = parseInt(index, 10);
      if (argIndex >= 0 && argIndex < args.length) {
        return args[argIndex];
      }
      return match; // Return original placeholder if index is out of bounds
    });
  }

/**
 * Get notification message from locale file
 * @param key - The notification key (e.g., "welcome_message")
 * @param lang - The language code (en, es)
 * @param args - Optional arguments to format the message
 * @returns The formatted notification message
 */
export function getNotificationMessage(
    key: string,
    lang: Locale = 'en',
    args: string[] = []
  ): string {
    // Use dot notation to access notifications.key
    const message = t(lang, `notifications.${key}`);
    
    if (!message) {
      // Fallback to key if translation not found
      return key;
    }
  
    return formatString(message, args);
  }

/**
 * Validate if a language code is supported
 */
export function isValidLocale(lang: string): lang is Locale {
    return ['en', 'es'].includes(lang);
  }