const js = require('@eslint/js');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const prettierPlugin = require('eslint-plugin-prettier');
const jsdocPlugin = require('eslint-plugin-jsdoc');

module.exports = [
	{
		ignores: [
			'node_modules/**',
			'dist/**',
			'coverage/**',
			'**/*.d.ts',
			'tests/**/*.test.js',
			'tests/**/*.spec.js',
		],
	},
	{
		files: ['src/**/*.ts', 'tests/**/*.ts'],
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
			jsdoc: jsdocPlugin,
			prettier: prettierPlugin,
		},
		rules: {
			// JSDoc validation (non-invasive repo-wide: validate/format only when JSDoc exists)
			'jsdoc/check-alignment': 'error',
			'jsdoc/check-indentation': 'error',
			'jsdoc/check-param-names': 'error',
			'jsdoc/check-tag-names': 'error',
			'jsdoc/check-template-names': 'error',
			'jsdoc/empty-tags': 'error',
			'jsdoc/multiline-blocks': ['error', { noSingleLineBlocks: true }],
			'jsdoc/no-bad-blocks': 'error',
			'jsdoc/no-defaults': 'error',
			'jsdoc/no-multi-asterisks': 'error',
			'jsdoc/no-types': 'error',
			'jsdoc/require-description': 'off',
			'jsdoc/require-param': 'off',
			'jsdoc/require-param-description': 'off',
			'jsdoc/require-returns': 'off',
			'jsdoc/require-returns-description': 'off',
			'jsdoc/require-throws': 'off',
			'jsdoc/tag-lines': 'off',

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
			indent: ['error', 'tab'],
			'linebreak-style': 'off',
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
			'no-nested-ternary': 'error',
			'no-ternary': 'error',
			'max-depth': ['error', 2],
			'max-lines-per-function': ['error', { max: 50 }],
			'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],

			// Ban regex literals and null usage
			'no-restricted-syntax': [
				'error',
				{
					selector: 'Literal[regex]',
					message: 'Regex literals are banned. Use string methods instead.',
				},
				{
					selector: 'Literal[value=null]',
					message: 'null is banned. Use undefined instead.',
				},
				{
					selector: 'TSTypeLiteral:not(:has(TSTypeAnnotation TSIndexSignatureDeclaration))',
					message: 'Anonymous object types are banned. Define a named interface instead.',
				},
				{
					selector: 'TSTypeReference[typeName.name="Record"]',
					message: 'Record type is banned. Use Map instead.',
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

			// JSDoc requirement for exported members
			'@typescript-eslint/explicit-function-return-type': [
				'error',
				{
					allowExpressions: false,
					allowTypedFunctionExpressions: false,
					allowHigherOrderFunctions: false,
				},
			],

			// Prettier integration
			'prettier/prettier': ['error', { endOfLine: 'auto' }],
		},
	},
	{
		files: ['src/interpret.ts'],
		rules: {
			// Public API must be documented
			'jsdoc/require-jsdoc': [
				'error',
				{
					publicOnly: {
						cjs: true,
						esm: true,
						window: false,
					},
					require: {
						FunctionDeclaration: true,
						MethodDefinition: true,
						ClassDeclaration: true,
					},
					contexts: ['ExportNamedDeclaration > FunctionDeclaration'],
				},
			],
			'jsdoc/tag-lines': ['error', 'any', { startLines: 1 }],
			'jsdoc/require-description': ['error', { contexts: ['FunctionDeclaration'] }],
			'jsdoc/require-param': 'error',
			'jsdoc/require-param-description': 'error',
			'jsdoc/require-returns': 'error',
			'jsdoc/require-returns-description': 'error',
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
