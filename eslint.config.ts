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
      "max-lines-per-function": ["error", 50],
      complexity: ["error", 10],
      "no-restricted-syntax": [
        "error",
        {
          selector: "TemplateLiteral",
          message:
            "Do not use template literals because they false flag PMD CPD.",
        },
      ],
    },
  },
  tseslint.configs.recommended,
]);
