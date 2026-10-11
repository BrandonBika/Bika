/**
 * @file apps/resident-pwa/src/features/i18n/language.js
 */
import { setLocale, getLocale } from '@civicneuro/i18n';

export const availableLanguages = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'zu', name: 'isiZulu', nativeName: 'isiZulu' },
  { code: 'xh', name: 'isiXhosa', nativeName: 'isiXhosa' },
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans' },
  { code: 'st', name: 'Sesotho', nativeName: 'Sesotho' }
];

const localeMap = { en: 'en', zu: 'zu', xh: 'zu', af: 'af', st: 'af' };

export function switchLanguage(code) {
  const targetCode = localeMap[code] ?? 'en';
  setLocale(targetCode);
}

export function getCurrentLanguage() {
  return getLocale();
}
