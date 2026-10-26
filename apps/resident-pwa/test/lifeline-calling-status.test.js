import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const packageRoot = path.resolve(import.meta.dirname, '../../..', 'packages');
const registeredElements = new Map();
globalThis.HTMLElement ||= class {};
globalThis.window ||= {
  location: { hash: '', pathname: '/', search: '' },
  sessionStorage: { getItem() { return null; }, setItem() {} }
};
globalThis.customElements ||= {
  define(name, element) { registeredElements.set(name, element); },
  get(name) { return registeredElements.get(name); }
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@civicneuro/')) {
      const packageName = specifier.slice('@civicneuro/'.length);
      const entry = path.join(packageRoot, packageName, 'src', 'index.js');
      return { url: pathToFileURL(entry).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  }
});

const { getLifelineCallingStatusSubtitle } = await import(
  '../src/pages/lifeline-calling-status/lifeline-calling-status.js'
);

test('shows the phone-contact subtitle when nobody is ringing in-app', () => {
  assert.equal(
    getLifelineCallingStatusSubtitle([
      { status: 'queued' },
      { status: 'queued' }
    ], [{}, {}]),
    'None of these contacts are on Bika yet. Tap Call to phone them.'
  );
});

test('keeps the group-call subtitle when at least one member is ringing', () => {
  assert.equal(
    getLifelineCallingStatusSubtitle([{ status: 'ringing' }], [{}, {}]),
    'Group call started for 2 people.'
  );
});
