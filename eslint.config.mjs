import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
    rules: {
      "max-lines": [
        "error",
        { max: 500, skipBlankLines: true, skipComments: true },
      ],
    },
  },
]);
