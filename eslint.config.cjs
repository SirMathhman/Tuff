const js = require("@eslint/js");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");

module.exports = [
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2020, sourceType: "module" },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
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
      // Enforce cyclomatic complexity limit
      complexity: ["error", { max: 45 }],
      // Previously: error, max 60 -> 50. Lowered to 45 to further tighten complexity checks
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
      ],
    },
  },
];
