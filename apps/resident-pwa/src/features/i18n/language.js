/**
 * @file apps/resident-pwa/src/features/i18n/language.js
 */
import { currentLocale, setLocale } from '../../../../../packages/i18n/src/index.js';

const LANGUAGE_PREFERENCE_KEY = 'civicneuro_language_preference';

export const availableLanguages = [
  { code: 'en', name: 'English', nativeName: 'English', hasTranslations: true },
  { code: 'zu', name: 'isiZulu', nativeName: 'isiZulu', hasTranslations: false },
  { code: 'xh', name: 'isiXhosa', nativeName: 'isiXhosa', hasTranslations: false },
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans', hasTranslations: false },
  { code: 'nso', name: 'Sepedi', nativeName: 'Sepedi', hasTranslations: false },
  { code: 'tn', name: 'Setswana', nativeName: 'Setswana', hasTranslations: false },
  { code: 'st', name: 'Sesotho', nativeName: 'Sesotho', hasTranslations: false },
  { code: 'ts', name: 'itsonga', nativeName: 'itsonga', hasTranslations: false },
  { code: 'ss', name: 'siSwati', nativeName: 'siSwati', hasTranslations: false },
  { code: 've', name: 'Tshivenda', nativeName: 'Tshivenda', hasTranslations: false },
  { code: 'nr', name: 'isiNdebele', nativeName: 'isiNdebele', hasTranslations: false }
];

export function switchLanguage(code) {
  const language = availableLanguages.find((item) => item.code === code);
  if (!language) throw new RangeError(`Unsupported language code: ${code}`);

  try {
    localStorage.setItem(LANGUAGE_PREFERENCE_KEY, language.code);
  } catch {
    // Language selection remains active for this page when storage is unavailable.
  }
  setLocale(language.hasTranslations ? language.code : 'en');
}

export function getCurrentLanguage() {
  try {
    const preferred = localStorage.getItem(LANGUAGE_PREFERENCE_KEY);
    if (availableLanguages.some((language) => language.code === preferred)) return preferred;
  } catch {
    // Fall back to the registered interface locale when storage is unavailable.
  }
  const locale = currentLocale();
  return availableLanguages.some((language) => language.code === locale) ? locale : 'en';
}
