import js from "@eslint/js";
import globals from "globals";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

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
    plugins: {
      local: {
        rules: {
          "inline-once-used": require("./eslint-rules/inline-once-used.js"),
          "inline-once-used-var": require("./eslint-rules/inline-once-used-var.js"),
          "no-duplicate-expression": require("./eslint-rules/no-duplicate-expression.js"),
        },
      },
    },
    rules: {
      "no-unused-vars": "warn",
      "no-console": "off",
      "local/inline-once-used": "error",
      "local/inline-once-used-var": "error",
      "local/no-duplicate-expression": "error",
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
