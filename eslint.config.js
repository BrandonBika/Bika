const readonlyGlobals = Object.fromEntries([
  'AbortController',
  'Blob',
  'Buffer',
  'CSS',
  'CustomEvent',
  'Deno',
  'DOMParser',
  'Element',
  'Event',
  'File',
  'FileReader',
  'FormData',
  'Headers',
  'HTMLElement',
  'Image',
  'IntersectionObserver',
  'MutationObserver',
  'Node',
  'Request',
  'ResizeObserver',
  'Response',
  'TextDecoder',
  'TextEncoder',
  'URL',
  'URLSearchParams',
  'WebSocket',
  'Window',
  'alert',
  'atob',
  'btoa',
  'caches',
  'cancelAnimationFrame',
  'clearInterval',
  'clearTimeout',
  'confirm',
  'console',
  'crypto',
  'customElements',
  'document',
  'fetch',
  'globalThis',
  'indexedDB',
  'location',
  'localStorage',
  'navigator',
  'performance',
  'process',
  'queueMicrotask',
  'requestAnimationFrame',
  'sessionStorage',
  'setInterval',
  'setTimeout',
  'window'
].map((name) => [name, 'readonly']));

export default [
  {
    ignores: [
      '**/node_modules/**',
      'apps/resident-pwa/public/vendor/**'
    ]
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: readonlyGlobals
    },
    rules: {
      'eqeqeq': 'warn',
      'no-constant-condition': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-fallthrough': 'error',
      'no-unreachable': 'error',
      'no-unused-vars': ['warn', {
        args: 'none',
        caughtErrors: 'none',
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_'
      }],
      'valid-typeof': 'error'
    }
  }
];