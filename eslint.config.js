import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    ignores: ["dist/**"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.node },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ThrowStatement",
          message:
            "Do not use throw statements, use a custom result obj instead.",
        },
        {
          selector: "Literal[regex]",
          message: "Do not use regex literals, for they hide complexity.",
        },
        {
          selector: "NewExpression[callee.name='RegExp']",
          message: "Do not use `new RegExp(...)`, for it hides complexity.",
        },
        {
          selector: "CallExpression[callee.name='RegExp']",
          message: "Do not use `RegExp(...)`, for it hides complexity.",
        },
      ],
      complexity: ["error", 10],
      "max-lines-per-function": ["error", 50],
    },
  },
]);
