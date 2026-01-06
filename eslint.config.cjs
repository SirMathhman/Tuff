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
      // limit file length to encourage smaller modules (include comments)
      "max-lines": [
        "error",
        { max: 500, skipComments: false, skipBlankLines: true },
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
          selector: "MemberExpression[object.type='MemberExpression']",
          message:
            "Avoid chained property access (Law of Demeter): prefer retrieving necessary data via single-level access or helper methods.",
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.type='MemberExpression']",
          message:
            "Avoid chaining method/property accesses (Law of Demeter): consider extracting into helper functions or intermediate variables.",
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
        {
          selector:
            "MemberExpression[object.type=MemberExpression], MemberExpression[object.type=CallExpression]",
          message:
            "Avoid chained property or call access (a.b.c or a.b().c); prefer Law of Demeter (tell, don't ask).",
        },
        {
          selector: "TSAsExpression",
          message:
            "Do not use 'as' type assertions; prefer typed factory helpers or explicit variable typing.",
        },
        {
          selector: "Literal[value=null]",
          message: "Do not use 'null'; prefer 'undefined' instead.",
        },
        {
          selector: "NullLiteral",
          message: "Do not use 'null'; prefer 'undefined' instead.",
        },
        {
          selector:
            "TSTypeReference[typeName.name='Result'] TSTypeParameterInstantiation > TSUndefinedKeyword",
          message:
            "Do not use Result<undefined, ...>; prefer returning 'InterpretError | undefined' instead.",
        },
      ],
      "@typescript-eslint/no-explicit-any": ["error"],
      ...require("@typescript-eslint/eslint-plugin").configs.recommended.rules,
    },
  },
];
