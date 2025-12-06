import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{js,ts}"],
    ignores: ["**/*.test.*", "dist"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
    rules: {
      "no-new-func": "error",
      "no-eval": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=null]",
          message: "Using null is banned — prefer undefined or explicit types.",
        },
      ],
    },
  },
];
