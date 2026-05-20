import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["eslint.config.mjs"],
  },
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: "commonjs",
    },
    rules: {
      "no-unused-vars": "warn",
      "no-console": "off",
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[regex]",
          message: "Regex literals are not allowed",
        },
        {
          selector: "NewExpression[callee.name='RegExp']",
          message: "new RegExp() is not allowed",
        },
        {
          selector: "CallExpression[callee.name='RegExp']",
          message: "RegExp() is not allowed",
        },
      ],
    },
  },
];
