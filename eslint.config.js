import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, {
  ignores: ["coverage/"],
  rules: {
    "max-lines": [
      "warn",
      {
        max: 300,
        skipBlankLines: true,
        skipComments: true,
      },
    ],
    "max-lines-per-function": [
      "warn",
      {
        max: 50,
        skipBlankLines: true,
        skipComments: true,
      },
    ],
    "@typescript-eslint/consistent-type-definitions": "error",
  },
});
