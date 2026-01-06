/* Flat config for ESLint v9. Recreates settings from previous .eslintrc.cjs
   See migration guide: https://eslint.org/docs/latest/use/configure/migration-guide */

module.exports = [
  // Ignore patterns (migrated from .eslintignore)
  { ignores: ["node_modules/**", "dist/**"] },

  // Base config with parser and rules
  {
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
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSTypeLiteral",
          message:
            "Avoid anonymous object types; use a named `interface` instead.",
        },
        {
          selector: "ThrowStatement",
          message:
            "Do not use `throw`. Return a `Result<T, X>` value instead of throwing exceptions.",
        },
        {
          selector: "Literal[value=null]",
          message:
            "Do not use `null`. Prefer `undefined`, `Result`, or a discriminated union for missing values.",
        },
        {
          selector: "ContinueStatement",
          message:
            "Do not use `continue`. Prefer early returns or restructure loops to avoid `continue`.",
        },
      ],
    },
  },

  // Overrides for TypeScript files
  {
    files: ["*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json"],
      },
    },
  },
];
