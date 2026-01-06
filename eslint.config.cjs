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
      // prefer interfaces over type aliases for object types
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
      // disallow throw statements; use Result<T,E> style returns instead
      "no-restricted-syntax": [
        "error",
        {
          selector: "ThrowStatement",
          message: "Do not use throw; return Result<T, E> instead.",
        },
        {
          selector: "VariableDeclarator[id.name=\"ok\"] > ArrowFunctionExpression",
          message: "Use a named function declaration `function ok(...)` instead of assigning an anonymous arrow function to `ok`.",
        },
        {
          selector: "VariableDeclarator[id.name=\"ok\"] > FunctionExpression",
          message: "Use a named function declaration `function ok(...)` instead of assigning an anonymous function to `ok`.",
        }
      ],
      ...require("@typescript-eslint/eslint-plugin").configs.recommended.rules,
    },
  },
];
