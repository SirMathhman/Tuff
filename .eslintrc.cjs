module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  env: {
    node: true,
    es6: true,
  },
  rules: {
    // Require semicolons for JS files
    semi: ["error", "always"],
    // Limit cyclomatic complexity per function
    complexity: ["error", { max: 15 }],
    // Disallow 'break' and 'continue' statements for simpler control flow
    "no-restricted-syntax": [
      "error",
      {
        selector: "BreakStatement",
        message:
          "Avoid 'break' statements; prefer clearer control flow (early returns, flags).",
      },
      {
        selector: "ContinueStatement",
        message:
          "Avoid 'continue' statements; prefer clearer control flow (early returns, flags).",
      },
    ],
  },
  overrides: [
    {
      files: ["**/*.ts"],
      rules: {
        // Ensure semicolons are enforced in TypeScript as well
        semi: ["error", "always"],
        // Also enforce complexity for TS files
        complexity: ["error", { max: 15 }],
        "no-restricted-syntax": [
          "error",
          {
            selector: "BreakStatement",
            message:
              "Avoid 'break' statements; prefer clearer control flow (early returns, flags).",
          },
          {
            selector: "ContinueStatement",
            message:
              "Avoid 'continue' statements; prefer clearer control flow (early returns, flags).",
          },
        ],
      },
    },
  ],
};
