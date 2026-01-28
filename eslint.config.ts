import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['node_modules/', 'dist/', '.husky/'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: globals.browser,
      parser: tseslint.parser,
    },
    rules: {
      'max-lines-per-function': ['error', { max: 50 }],
      'max-depth': ['error', 2],
    }
  },
];
