// Flat config for ESLint v9+ (compatible with TypeScript and Prettier)
module.exports = [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: require('@typescript-eslint/parser'),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname
      }
    },
    plugins: {
      '@typescript-eslint': require('@typescript-eslint/eslint-plugin'),
      prettier: require('eslint-plugin-prettier')
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'prettier/prettier': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TemplateLiteral',
          message: 'Template literals are disallowed; use string concatenation instead.'
        }
      ]
    },
    ignores: ['dist', 'node_modules']
  }
];
