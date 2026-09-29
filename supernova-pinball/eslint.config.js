// Minimal flat config (no plugins needed): `npx eslint .`
const browser = {
  window: 'readonly', document: 'readonly', navigator: 'readonly', location: 'readonly', localStorage: 'readonly',
  performance: 'readonly', requestAnimationFrame: 'readonly', matchMedia: 'readonly', setTimeout: 'readonly',
  getComputedStyle: 'readonly', URLSearchParams: 'readonly',
};
const node = { process: 'readonly', console: 'readonly', setTimeout: 'readonly', URL: 'readonly', Buffer: 'readonly' };

export default [
  { ignores: ['test-results/**'] },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...browser, ...node } },
    rules: {
      'no-undef': 'error', 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-unreachable': 'error', 'no-dupe-keys': 'error', 'no-duplicate-case': 'error',
      'no-const-assign': 'error', 'no-redeclare': 'error', 'eqeqeq': ['error', 'smart'], 'prefer-const': 'error',
    },
  },
];
