import js from "@eslint/js";
import tseslint from "typescript-eslint";
import noThrow from "./eslint-rules/no-throw.mjs";
import noNull from "./eslint-rules/no-null.mjs";
import noAnonObjectType from "./eslint-rules/no-anon-object-type.mjs";
import noRecord from "./eslint-rules/no-record.mjs";

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
      custom: {
        rules: {
          "no-throw": noThrow,
          "no-null": noNull,
          "no-anon-object-type": noAnonObjectType,
          "no-record": noRecord,
        },
      },
    },
    rules: {
      "custom/no-throw": "error",
      "custom/no-null": "error",
      "custom/no-anon-object-type": "error",
      "custom/no-record": "error",
    },
  },
];
