import js from "@eslint/js";
import tseslint from "typescript-eslint";
import noThrow from "./eslint-rules/no-throw.mjs";
import noNull from "./eslint-rules/no-null.mjs";

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
    ignores: ["eslint-rules/**"],
  },
  {
    plugins: {
      custom: { rules: { "no-throw": noThrow, "no-null": noNull } },
    },
    rules: {
      "custom/no-throw": "error",
      "custom/no-null": "error",
    },
  },
];
