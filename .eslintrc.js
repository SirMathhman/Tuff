module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  rules: {
    // Ban regex literals and RegExp usage
    "no-restricted-syntax": [
      "error",
      {
        selector: "Literal[regex]",
        message:
          "Regex literals are banned. Use alternative parsing methods instead.",
      },
      {
        selector: "NewExpression[callee.name='RegExp']",
        message:
          "Using RegExp constructor is banned. Use alternative parsing methods instead.",
      },
      {
        selector: "CallExpression[callee.name='RegExp']",
        message:
          "Calling RegExp is banned. Use alternative parsing methods instead.",
      },
    ],

    // Limit cyclomatic complexity
    complexity: ["error", { max: 15 }],
  },
};
