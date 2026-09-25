// Minimal flat config (no plugins needed). Run via `npm run check`.
const browser = {
  window: 'readonly', document: 'readonly', navigator: 'readonly', location: 'readonly', localStorage: 'readonly',
  performance: 'readonly', requestAnimationFrame: 'readonly', matchMedia: 'readonly', setTimeout: 'readonly',
  confirm: 'readonly', innerWidth: 'readonly', innerHeight: 'readonly', Element: 'readonly', URLSearchParams: 'readonly',
};
const node = { process: 'readonly', console: 'readonly', setTimeout: 'readonly', URL: 'readonly' };

export default [
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
