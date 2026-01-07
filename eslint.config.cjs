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
      sonarjs: require("eslint-plugin-sonarjs"),
    },
    rules: {
      complexity: ["error", { max: 15 }],
      "sonarjs/max-lines": ["error", { maximum: 500 }],
      "sonarjs/max-lines-per-function": ["error", { maximum: 50 }],
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],

      // Treat unused vars/params as errors
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          vars: "all",
          args: "after-used",
          ignoreRestSiblings: true,
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],

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
        {
          selector: "BreakStatement",
          message:
            "Do not use `break`. Restructure loops or use different control flow to avoid `break`.",
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

  // File-specific rules
  {
    files: ["src/result.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "VariableDeclarator > ArrowFunctionExpression",
          message:
            "Do not assign functions to variables in `result.ts`. Prefer named function declarations (e.g., `function myFunc() {}`).",
        },
      ],
    },
  },
];
