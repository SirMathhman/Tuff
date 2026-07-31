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
      "max-lines": [
        "warn",
        {
          max: 500,
          skipComments: true,
          skipBlankLines: true,
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSTypeLiteral",
          message: "Use a named interface instead.",
        },
        {
          selector: "ThrowStatement",
          message: "Use a Result monad",
        },
      ],
    },
  },
  tseslint.configs.recommended,
]);
