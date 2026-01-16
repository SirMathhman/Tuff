const js = require('@eslint/js');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const prettierPlugin = require('eslint-plugin-prettier');

module.exports = [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      // ESLint core rules - extremely strict
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'no-unused-vars': 'off', // Disabled in favor of TypeScript rule
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-arrow-callback': 'error',
      'no-implicit-coercion': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'brace-style': ['error', '1tbs'],
      'comma-dangle': ['error', 'always-multiline'],
      semi: ['error', 'always'],
      quotes: ['error', 'single', { avoidEscape: true }],
      'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0 }],
      indent: ['error', 2],
      'linebreak-style': ['error', 'unix'],
      'no-trailing-spaces': 'error',
      'no-irregular-whitespace': 'error',
      'object-curly-spacing': ['error', 'always'],
      'array-bracket-spacing': ['error', 'never'],
      'space-before-function-paren': [
        'error',
        { anonymous: 'always', named: 'never', asyncArrow: 'always' },
      ],
      'space-infix-ops': 'error',
      'keyword-spacing': 'error',
      'comma-spacing': 'error',
      'no-multi-spaces': 'error',
      'arrow-spacing': 'error',
      'no-shadow': 'off', // Disabled in favor of TypeScript rule
      'no-redeclare': 'off', // Disabled in favor of TypeScript rule
      'no-duplicate-imports': 'error',
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'prefer-template': 'error',
      'object-shorthand': 'error',
      'no-param-reassign': 'error',
      'no-regex-literals': 'off', // We use no-restricted-syntax instead for more control
      'max-depth': ['error', 2],

      // Ban regex literals
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[regex]',
          message: 'Regex literals are banned. Use string methods instead.',
        },
      ],

      // TypeScript-specific rules - extremely strict
      '@typescript-eslint/strict-boolean-expressions': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-redeclare': 'error',
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'default',
          format: ['camelCase'],
          leadingUnderscore: 'forbid',
          trailingUnderscore: 'forbid',
        },
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE'],
          leadingUnderscore: 'forbid',
          trailingUnderscore: 'forbid',
        },
        {
          selector: 'typeLike',
          format: ['PascalCase'],
          leadingUnderscore: 'forbid',
          trailingUnderscore: 'forbid',
        },
        {
          selector: 'enumMember',
          format: ['UPPER_CASE'],
          leadingUnderscore: 'forbid',
          trailingUnderscore: 'forbid',
        },
      ],

      // Prettier integration
      'prettier/prettier': 'error',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      // Relax some rules for test files
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
