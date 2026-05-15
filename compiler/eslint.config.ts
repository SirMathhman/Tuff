import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";
import noSingleUseFunction from "./eslint-rules/no-single-use-function";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    plugins: {
      js,
      local: { rules: { "no-single-use-function": noSingleUseFunction } },
    },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.node },
    rules: {
      "local/no-single-use-function": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[regex]",
          message:
            "Regex literals are not allowed because compilers should not use regexes.",
        },
        {
          selector: "NewExpression[callee.name='RegExp']",
          message:
            "new RegExp() is not allowed because compilers should not use regexes.",
        },
        {
          selector: "CallExpression[callee.name='RegExp']",
          message:
            "RegExp() is not allowed because compilers should not use regexes.",
        },
        {
          selector: "TemplateLiteral",
          message: "Templates are not allowed because they false-flag CPD.",
        },
        {
          selector: "ThrowStatement",
          message:
            "throw statements are not allowed. Use a custom Result<T, E> type instead for error handling.",
        },
      ],
    },
  },
  tseslint.configs.recommended,
]);
