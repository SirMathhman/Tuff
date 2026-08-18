import tseslint from "typescript-eslint";

export default tseslint.config(...tseslint.configs.recommended, {
  ignores: ["node_modules/"],
  rules: {
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
