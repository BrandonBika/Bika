/**
 * @file packages/i18n/src/index.js
 * @description Internationalization module.
 * Loads locale JSON files; falls back to English for missing keys.
 * No external dependencies.
 */

/** @type {Record<string, Record<string, unknown>>} */
const LOCALES = {};

/** @type {string} */
let _current = 'en';

/**
 * Registers a set of locale message objects.
 * @param {Record<string, Record<string, unknown>>} locales
 */
export function initI18n(locales) {
  for (const [lang, messages] of Object.entries(locales)) {
    registerLocale(lang, messages);
  }
}

/**
 * Registers a locale object. Called at app boot for each locale.
 * @param {string} lang
 * @param {Record<string, unknown>} messages
 */
export function registerLocale(lang, messages) {
  LOCALES[lang] = messages;
}

/**
 * Sets the active language.
 * @param {string} lang - e.g. 'en', 'zu', 'af'
 */
export function setLocale(lang) {
  if (!LOCALES[lang]) {
    console.warn(`[i18n] Locale '${lang}' not registered. Falling back to 'en'.`);
    _current = 'en';
  } else {
    _current = lang;
  }
  // Persist preference (non-sensitive)
  try { localStorage.setItem('civicneuro_lang', lang); } catch { /* ignore */ }
  // Dispatch event so components can re-render
  window.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang: _current } }));
}

/**
 * Returns the stored or system language preference.
 * @returns {string}
 */
export function detectLocale() {
  try {
    const stored = localStorage.getItem('civicneuro_lang');
    if (stored && LOCALES[stored]) return stored;
  } catch { /* ignore */ }
  const sys = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return LOCALES[sys] ? sys : 'en';
}

/**
 * Looks up a translation key using dot notation.
 * Falls back to English, then to the key itself.
 * @param {string} key - e.g. 'common.loading'
 * @param {Record<string, string>} [vars] - Interpolation variables: {name} etc.
 * @returns {string}
 */
export function t(key, vars) {
  const value = resolve(key, _current) ?? resolve(key, 'en') ?? key;
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

/**
 * @param {string} key
 * @param {string} lang
 * @returns {string|undefined}
 */
function resolve(key, lang) {
  const messages = LOCALES[lang];
  if (!messages) return undefined;
  const parts = key.split('.');
  let cur = messages;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = /** @type {Record<string,unknown>} */ (cur)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/** Current language code */
export function currentLocale() { return _current; }
