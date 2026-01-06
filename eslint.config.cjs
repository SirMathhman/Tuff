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
          selector: "VariableDeclarator > ArrowFunctionExpression, VariableDeclarator > FunctionExpression",
          message: "Use a function declaration `function name(...) {}` instead of assigning a function expression or arrow function to a variable.",
        }
      ],
      ...require("@typescript-eslint/eslint-plugin").configs.recommended.rules,
    },
  },
];
