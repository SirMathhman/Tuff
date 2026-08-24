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
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      "max-lines-per-function": [
        "warn",
        {
          max: 100,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "ThrowStatement",
          message: "Use a Result instead.",
        },
        {
          selector: "TSTypeLiteral",
          message: "Use a named interface instead.",
        },
        {
          selector: "TSPropertySignature[typeAnnotation.typeAnnotation.type='TSLiteralType']",
          message: "Do not use literals in types, use an enum instead.",
        },
      ],
    },
  },
  tseslint.configs.recommended,
  {
    // Result's discriminant is a boolean literal (`ok: true` / `ok: false`);
    // TypeScript does not allow boolean-valued enum members, so the
    // named-interface / enum rules are waived for this module only.
    files: ["src/result.ts"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
]);
