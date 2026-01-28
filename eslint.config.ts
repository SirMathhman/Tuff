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
      'max-depth': ['error', 2],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TemplateLiteral',
          message: 'Template literals are not allowed due to CPD false flags. Use string concatenation instead.',
        },
      ],
    },
  },
];
