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
      // limit function body size
      "max-lines-per-function": [
        "error",
        { max: 50, skipComments: true, skipBlankLines: true },
      ],
      // disallow throw statements; use Result<T,E> style returns instead
      "no-restricted-syntax": [
        "error",
        {
          selector: "ThrowStatement",
          message: "Do not use throw; return Result<T, E> instead.",
        },
        {
          selector:
            "VariableDeclarator > ArrowFunctionExpression, VariableDeclarator > FunctionExpression",
          message:
            "Use a function declaration `function name(...) {}` instead of assigning a function expression or arrow function to a variable.",
        },
        {
          selector:
            "FunctionDeclaration TSInterfaceDeclaration, FunctionExpression TSInterfaceDeclaration, ArrowFunctionExpression TSInterfaceDeclaration",
          message:
            "Do not declare interfaces inside functions; declare them at module scope instead.",
        },
        {
          selector: "BreakStatement",
          message:
            "Avoid 'break'; prefer explicit loop conditions or refactor into smaller functions.",
        },
        {
          selector: "ContinueStatement",
          message:
            "Avoid 'continue'; prefer clearer control flow or use helper functions.",
        },
      ],
      ...require("@typescript-eslint/eslint-plugin").configs.recommended.rules,
    },
  },
];
