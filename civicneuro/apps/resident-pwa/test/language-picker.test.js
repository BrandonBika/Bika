import test from 'node:test';
import assert from 'node:assert/strict';
import {
  currentLocale,
  initI18n
} from '../../../packages/i18n/src/index.js';
import {
  availableLanguages,
  getCurrentLanguage,
  switchLanguage
} from '../src/features/i18n/language.js';

function withBrowserGlobals(run) {
  const previousWindow = globalThis.window;
  const previousLocalStorage = globalThis.localStorage;
  const previousCustomEvent = globalThis.CustomEvent;
  const stored = new Map();
  globalThis.localStorage = {
    getItem: (key) => stored.get(key) || null,
    setItem: (key, value) => stored.set(key, String(value))
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options?.detail;
    }
  };
  globalThis.window = { dispatchEvent: () => true };
  try {
    return run();
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousLocalStorage;
    if (previousCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = previousCustomEvent;
  }
}

test('language picker exposes the 11 official languages without mapping one language to another', () => {
  assert.deepEqual(availableLanguages.map(({ code }) => code), [
    'en', 'zu', 'xh', 'af', 'nso', 'tn', 'st', 'ts', 'ss', 've', 'nr'
  ]);
  assert.deepEqual(availableLanguages.map(({ name }) => name), [
    'English', 'isiZulu', 'isiXhosa', 'Afrikaans', 'Sepedi', 'Setswana',
    'Sesotho', 'itsonga', 'siSwati', 'Tshivenda', 'isiNdebele'
  ]);
  assert.equal(availableLanguages.filter(({ hasTranslations }) => hasTranslations).map(({ code }) => code).join(','), 'en');
});

test('language adapter imports the exported currentLocale and preserves English fallback selection', () => {
  initI18n({ en: { app: { label: 'English' } } });
  withBrowserGlobals(() => {
    switchLanguage('xh');
    assert.equal(currentLocale(), 'en');
    assert.equal(getCurrentLanguage(), 'xh');

    switchLanguage('en');
    assert.equal(currentLocale(), 'en');
    assert.equal(getCurrentLanguage(), 'en');

    assert.throws(() => switchLanguage('xx'), /Unsupported language code/);
  });
});
