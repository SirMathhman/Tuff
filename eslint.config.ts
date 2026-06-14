import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.node },
    rules: {
      "no-new-func": "error",
      "no-eval": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "max-lines": [
        "error",
        { max: 500, skipBlankLines: true, skipComments: true },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "TemplateLiteral",
          message:
            "Do not use template strings because they false-flag PMD CPD.",
        },
        {
          selector: "Literal[regex]",
          message:
            "Regex literals are not allowed because this is an interpreter.",
        },
        {
          selector: "NewExpression[callee.name='RegExp']",
          message:
            "new RegExp() is not allowed because this is an interpreter.",
        },
        {
          selector: "CallExpression[callee.name='RegExp']",
          message:
            "RegExp() calls are not allowed because this is an interpreter.",
        },
      ],
    },
  },
  tseslint.configs.recommended,
]);
