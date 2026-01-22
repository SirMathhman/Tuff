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
      ],
      "max-lines-per-function": [
        "error",
        {
          max: 50,
          skipComments: true,
          skipBlankLines: true,
        },
      ],
    },
  },
];
