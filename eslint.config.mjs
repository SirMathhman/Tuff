import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    ignores: ["./lib.js"],
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.node },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[regex]",
          message: "Regex literals are not allowed.",
        },
        {
          selector: 'NewExpression[callee.name="RegExp"]',
          message: "`new RegExp()` is not allowed.",
        },
        {
          selector: 'CallExpression[callee.name="RegExp"]',
          message: "`RegExp()` calls are not allowed.",
        },
      ],
    },
  },
]);
