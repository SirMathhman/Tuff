import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    ignores: ["src/main/generated-ts/**"],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.node },
    rules: {
      complexity: ["error", 10],
      "max-lines": [
        "error",
        {
          max: 500,
          skipComments: true,
          skipBlankLines: true,
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
      "no-restricted-syntax": [
        "error",
        {
          selector: "TemplateLiteral",
          message:
            "Template literals are not allowed. Use string concatenation instead.",
        },
      ],
    },
  },
  tseslint.configs.recommended,
]);
