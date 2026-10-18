import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const packageRoot = path.resolve(import.meta.dirname, '../../..', 'packages');
const registeredElements = new Map();

globalThis.HTMLElement ||= class {};
globalThis.customElements ||= {
  define(name, element) {
    registeredElements.set(name, element);
  },
  get(name) {
    return registeredElements.get(name);
  }
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@civicneuro/')) {
      const packageName = specifier.slice('@civicneuro/'.length);
      const entry = path.join(packageRoot, packageName, 'src', 'index.js');
      if (fs.existsSync(entry)) {
        return { url: pathToFileURL(entry).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  }
});

test('Snap & Say page and its real classification modules import successfully', async () => {
  const page = await import('../src/pages/snap-and-say/snap-and-say.js');
  const polling = await import('../src/features/snap-and-say/classification-poll.js');
  const language = await import('../src/features/snap-and-say/language-labels.js');

  assert.equal(typeof page.PageSnapAndSay, 'function');
  assert.equal(typeof polling.pollSnapAndSayClassification, 'function');
  assert.equal(typeof language.languageName, 'function');
  assert.equal(customElements.get('page-snap-and-say'), page.PageSnapAndSay);
});

test('shows a visible fallback when Snap & Say rendering fails', async () => {
  const { PageSnapAndSay } = await import('../src/pages/snap-and-say/snap-and-say.js');
  const page = Object.create(PageSnapAndSay.prototype);
  const children = [];
  page.replaceChildren = () => { children.length = 0; };
  page.appendChild = (child) => children.push(child);
  globalThis.document = {
    createElement(tagName) {
      return {
        tagName,
        attributes: {},
        children: [],
        style: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener() {},
        append(...items) { this.children.push(...items); }
      };
    }
  };
  page._renderContent = () => {
    throw new Error('simulated render failure');
  };

  const originalConsoleError = console.error;
  try {
    console.error = () => {};
    page.render();
    assert.equal(children[0].tagName, 'section');
    assert.equal(children[0].attributes.role, 'alert');
    assert.equal(children[0].children[0].textContent, 'Snap & Say could not be displayed');
  } finally {
    console.error = originalConsoleError;
    delete globalThis.document;
  }
});
