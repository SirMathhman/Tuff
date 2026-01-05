import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      complexity: ["error", 15],
      "max-lines": [
        "error",
        { max: 500, skipBlankLines: false, skipComments: false },
      ],
    },
  },
  {
    files: ["scripts/**/*.mjs", "eslint.config.js", "jest.config.js"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
  {
    ignores: ["dist/", "node_modules/"],
  }
);
