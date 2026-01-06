module.exports = [
  {
    ignores: ["node_modules/**", "dist/**", "coverage/**"],
  },

  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: require("@typescript-eslint/parser"),
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": require("@typescript-eslint/eslint-plugin"),
    },
    rules: {
      complexity: ["error", { max: 15 }],
      // disallow throw statements; use Result<T,E> style returns instead
      "no-restricted-syntax": [
        "error",
        {
          selector: "ThrowStatement",
          message: "Do not use throw; return Result<T, E> instead.",
        },
      ],
      ...require("@typescript-eslint/eslint-plugin").configs.recommended.rules,
    },
  },
];
