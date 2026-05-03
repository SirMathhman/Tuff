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
      // Disallow "throw" statements and recommend a custom Result<T, X> instead using no-restricted-syntax:
      "no-restricted-syntax": [
        "error",
        {
          selector: "ThrowStatement",
          message:
            "Throw statements are not allowed. Use a custom Result<T, X> type instead.",
        },
      ],
      complexity: ["error", 10],
    },
  },
  tseslint.configs.recommended,
]);
