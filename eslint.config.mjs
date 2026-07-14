import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";
import noSingleUseFunction from "./eslint-rules/no-single-use-function.mjs";
import noDuplicateExpression from "./eslint-rules/no-duplicate-expression.mjs";

const local = {
  rules: {
    "no-single-use-function": noSingleUseFunction,
    "no-duplicate-expression": noDuplicateExpression,
  },
};

const noRestrictedSyntax = [
  "error",
  {
    selector: "Literal[regex]",
    message: "Regex literals are not allowed.",
  },
  {
    selector: 'NewExpression[callee.name="RegExp"]',
    message: "`new RegExp()` is not allowed.",
  },
  {
    selector: 'CallExpression[callee.name="RegExp"]',
    message: "`RegExp()` calls are not allowed.",
  },
  {
    selector: "ThrowStatement",
    message: "Do not use throw statements, use Result<T, X> instead.",
  },
];

export default defineConfig([
  {
    ignores: ["./lib.js"],
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { js, local },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.node },
    rules: {
      "no-restricted-syntax": noRestrictedSyntax,
      "local/no-single-use-function": "warn",
      "local/no-duplicate-expression": "warn",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "@typescript-eslint": tseslint.plugin, local },
    languageOptions: {
      globals: globals.node,
      parser: tseslint.parser,
    },
    rules: {
      "no-restricted-syntax": noRestrictedSyntax,
      "local/no-single-use-function": "warn",
      "local/no-duplicate-expression": "warn",
    },
  },
]);
