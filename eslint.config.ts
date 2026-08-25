import js from "@eslint/js";
import globals from "globals";
import jsdoc from "eslint-plugin-jsdoc";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    plugins: { js, jsdoc },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.node },
    rules: {
      "no-new-func": "error",
      "no-eval": "error",
      "max-lines": [
        "warn",
        {
          max: 300,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      "max-lines-per-function": [
        "warn",
        {
          max: 50,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      "jsdoc/check-syntax": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSTypeLiteral",
          message: "Use a named interface.",
        },
        {
          selector: "ClassDeclaration",
          message: "Use plain functions.",
        },
      ],
    },
  },
  tseslint.configs.recommended,
]);
