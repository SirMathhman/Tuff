const js = require("@eslint/js");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const maxInterfaceFields = require("./eslint-rules/max-interface-fields");
const noUnknownReturn = require("./eslint-rules/no-unknown-return");

module.exports = [
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2020, sourceType: "module" },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      custom: {
        rules: {
          "max-interface-fields": maxInterfaceFields,
          "no-unknown-return": noUnknownReturn,
        },
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "max-lines": [
        "error",
        { max: 500, skipBlankLines: true, skipComments: false },
      ],
      "max-lines-per-function": [
        "error",
        {
          max: 50,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      // Enforce cyclomatic complexity limit
      complexity: ["error", { max: 15 }],
      // Previously: error, max 60 -> 50 -> 45 -> 40 -> 35 -> 30 -> 25 -> 20. Lowered to 15 to further tighten complexity checks
      // Limit function parameters to maximum of 3
      "max-params": ["error", { max: 3 }],
      // Disallow use of the `Record` utility type in favor of `Map` via AST selector
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSTypeReference[typeName.name='Record']",
          message: "Use Map<K, V> instead of Record<K, V>",
        },
        {
          selector: "Literal[value=null]",
          message: "Use undefined instead of null",
        },
        {
          selector: "TSAsExpression",
          message:
            "Type assertions using 'as' are banned; use type guards or 'in' checks instead",
        },
        {
          selector: "TSTypeAssertion",
          message:
            "Type assertions using <T> are banned; use type guards or 'in' checks instead",
        },
        {
          selector: "TSTypeLiteral",
          message:
            "Anonymous object types are banned; define a named type instead",
        },
        {
          selector:
            "TSInterfaceBody TSPropertySignature > TSTypeAnnotation > TSUnknownKeyword",
          message:
            "The 'unknown' type is banned in interface properties; use a more specific type",
        },
      ],
      // Custom rule: Limit interface fields to maximum of 5 (excluding methods)
      "custom/max-interface-fields": ["error", { max: 5 }],
      // Custom rule: Ban 'unknown' in function return types
      "custom/no-unknown-return": "error",
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      "max-lines-per-function": "off",
      "max-lines": "off",
    },
  },
];
