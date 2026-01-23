import js from "@eslint/js";
import ts from "typescript-eslint";

export default [
  {
    ignores: ["node_modules/", "dist/", ".git/"],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: ts.parser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
      },
    },
    rules: {
      "no-unused-vars": "off",
      "no-regex-spaces": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[regex]",
          message:
            "Regular expressions are not allowed. Parse strings using alternative methods instead.",
        },
        {
          selector: 'NewExpression[callee.name="RegExp"]',
          message: "RegExp constructor is not allowed.",
        },
        {
          selector: "Literal[value=null]",
          message:
            "null is not allowed. Use undefined instead for consistency.",
        },
      ],
      "max-lines-per-function": [
        "error",
        {
          max: 50,
          skipComments: true,
          skipBlankLines: true,
        },
      ],
      // No intentation. This is the challenge
      "max-depth": ["error", 1],
      "max-lines": [
        "error",
        {
          max: 200,
          skipComments: true,
          skipBlankLines: true,
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
];
