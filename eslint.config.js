module.exports = [
  // Base config
  {
    ignores: ["node_modules", "dist", "coverage", "pnpm-lock.yaml"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "module",
    },
    rules: {
      "no-new-func": "error",
      complexity: ["error", { max: 15 }],
      // Ban throwing; prefer Result<T, E> return values
      "no-restricted-syntax": [
        "error",
        {
          selector: "ThrowStatement",
          message: "Avoid using `throw`. Return a Result<T, E> instead.",
        },
        {
          selector: "Literal[value=null]",
          message: "Do not use `null`; use `undefined` instead.",
        },
      ],
      // Disallow assignments in conditional statements (if/while/for)
      "no-cond-assign": ["error", "always"],
    },
  },
  // TypeScript files
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: require("@typescript-eslint/parser"),
      parserOptions: { ecmaVersion: 2021 },
    },
    plugins: {
      "@typescript-eslint": require("@typescript-eslint/eslint-plugin"),
    },
    rules: {},
  },
];
