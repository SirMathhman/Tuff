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
    },
  },
];
