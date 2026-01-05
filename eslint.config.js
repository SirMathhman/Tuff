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
          selector: "TSAsExpression",
          message: "Avoid `as` type assertions; prefer type narrowing instead.",
        },
        {
          selector: "ThrowStatement",
          message: "Avoid using `throw`. Return a Result<T, E> instead.",
        },
        {
          selector: "Literal[value=null]",
          message: "Do not use `null`; use `undefined` instead.",
        },
        {
          selector: "BreakStatement",
          message: "Avoid using `break`. Use loop conditions or flags instead.",
        },
      ],
      // Disallow assignments in conditional statements (if/while/for)
      "no-cond-assign": ["error", "always"],
      // Treat unreachable code as an error (aligns with TS7027)
      "no-unreachable": "error",
      // Disallow ternary conditional operators
      "no-ternary": "error",
      // Disallow continue statements
      "no-continue": "error",
      // Limit function parameters to 3
      "max-params": ["error", 3],
      // Limit function length to 50 lines
      "max-lines-per-function": [
        "error",
        { max: 50, skipComments: true, skipBlankLines: true },
      ],
      // Limit file length to 500 lines
      "max-lines": ["error", { max: 500 }],
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
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
];
