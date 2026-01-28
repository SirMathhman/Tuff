import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import noInnerFunctions from './eslint-rules/no-inner-functions';

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
    plugins: {
      customRules: {
        rules: {
          'no-inner-functions': noInnerFunctions,
        },
      },
    },
    rules: {
      'customRules/no-inner-functions': 'error',
    },
  },
];
