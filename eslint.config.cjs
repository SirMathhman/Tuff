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
