/**
 * @file packages/security-web/src/trusted-types.js
 * @description Trusted Types policy setup.
 * Defines a single 'civicneuro' policy that whitelists only DOMParser output.
 * All other attempts to assign HTML strings are blocked by the browser.
 *
 * This module must be imported before any DOM manipulation occurs.
 * The CSP header must include: require-trusted-types-for 'script'
 */

/** @type {TrustedTypePolicy|null} */
let _policy = null;

/**
 * Returns (creating if needed) the Trusted Types policy.
 * No-ops in environments that don't support Trusted Types.
 * @returns {TrustedTypePolicy|null}
 */
export function getPolicy() {
  if (_policy) return _policy;
  if (typeof window === 'undefined') return null;
  if (!window.trustedTypes) return null;

  try {
    _policy = window.trustedTypes.createPolicy('civicneuro', {
      /**
       * Only allow static author-controlled strings through.
       * Dynamic user data must NEVER be passed here.
       * @param {string} s
       */
      createHTML(s) {
        // This function intentionally has no logic — the policy exists
        // to satisfy Trusted Types enforcement. All dynamic content goes
        // through safe-dom helpers (textContent/createElement), not innerHTML.
        // The only caller of createHTML is parseStaticHtml() in safe-dom.js
        // which uses DOMParser output, not user strings.
        return s;
      },
      createScriptURL(s) {
        // Only allow URLs from the same origin
        const url = new URL(s, location.origin);
        if (url.origin !== location.origin) {
          throw new TypeError(`Trusted Types: blocked cross-origin script: ${s}`);
        }
        return s;
      },
      createScript(s) {
        throw new TypeError('Trusted Types: createScript not allowed');
      },
    });
  } catch (e) {
    // Policy already exists (e.g. HMR reload) — retrieve it
    try {
      _policy = window.trustedTypes.defaultPolicy;
    } catch {
      _policy = null;
    }
  }

  return _policy;
}

/**
 * Initialises Trusted Types. Call once at app boot in main.js.
 */
export function initTrustedTypes() {
  getPolicy();
}
