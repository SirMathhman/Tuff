import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["main.js"],
  },
  {
    files: ["**/*.js"],
    languageOptions: { globals: globals.node },
  },
  js.configs.recommended,
];
