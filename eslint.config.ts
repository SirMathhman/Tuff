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
      "max-lines-per-function": [
        "error",
        {
          max: 50,
          skipComments: true,
          skipBlankLines: true,
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "ClassDeclaration",
          message: "Do not use classes, use interfaces and functions.",
        },
      ],
    },
  },
  tseslint.configs.recommended,
]);
