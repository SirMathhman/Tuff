module.exports = {
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: "module",
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
  },
  plugins: ["@typescript-eslint"],
  env: {
    node: true,
    es2021: true,
  },
  rules: {
    // Limit cyclomatic complexity to 15
    complexity: ["error", { max: 15 }],
    // Prefer `interface` for object type definitions
    "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
    // Disallow anonymous object types (prefer named interfaces)
    "no-restricted-syntax": [
      "error",
      {
        selector: "TSTypeLiteral",
        message:
          "Avoid anonymous object types; use a named `interface` instead.",
      },
    ],
  },
  overrides: [
    {
      files: ["*.ts"],
      parserOptions: {
        project: ["./tsconfig.json"],
      },
    },
  ],
};
