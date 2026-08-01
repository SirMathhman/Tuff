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
        {
          selector: "ClassDeclaration",
          message: "Do not use classes for simplicity.",
        },
        {
          selector: "ThrowStatement",
          message: "This makes the control flow more clear.",
        },
        {
          selector: "TemplateLiteral",
          message:
            "Remove templates because it's one less thing to support when we self host.",
        },
      ],
      "@typescript-eslint/no-restricted-types": [
        "error",
        {
          types: {
            Record: {
              message: "Use Map instead of Record for consistency.",
            },
            Error: {
              message:
                "Do not use the default JS error (we don't throw or catch anyways). Use something more specific and clear.",
            },
          },
        },
      ],
    },
  },
  tseslint.configs.recommended,
]);
