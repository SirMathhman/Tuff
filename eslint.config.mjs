import js from "@eslint/js";
import tseslint from "typescript-eslint";
import noThrow from "./eslint-rules/no-throw.mjs";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "no-console": "warn",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    plugins: {
      custom: { rules: { "no-throw": noThrow } },
    },
    rules: {
      "custom/no-throw": "error",
    },
  },
];
