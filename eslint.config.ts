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
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSTypeLiteral",
          message: "Use named interfaces instead.",
        },
        {
          selector: "Literal[regex]",
          message: "Regexes don't make sense in a compiler.",
        },
      ],
      "@typescript-eslint/no-restricted-types": [
        "error",
        {
          types: {
            Record: {
              message: "Use Map instead of Record for consistency.",
            },
          },
        },
      ],
    },
  },
  tseslint.configs.recommended,
]);
