import tseslint from "typescript-eslint";

export default tseslint.config(...tseslint.configs.recommended, {
  ignores: ["node_modules/"],
  rules: {
    "max-lines": [
      "error",
      {
        max: 300,
        skipBlankLines: true,
        skipComments: true,
      },
    ],
    "max-lines-per-function": [
      "error",
      {
        max: 50,
        skipBlankLines: true,
        skipComments: true,
      },
    ],
    "no-restricted-syntax": [
      "error",
      {
        selector: "TSTypeLiteral",
        message: "Use a named interface instead.",
      },
      {
        selector: "ThrowStatement",
        message: "Use a Result monad instead.",
      },
    ],
  },
});
