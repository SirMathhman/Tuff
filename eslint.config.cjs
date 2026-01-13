const tsPlugin = require("@typescript-eslint/eslint-plugin");

module.exports = [
  // ignore common generated and dependency folders
  {
    ignores: ["node_modules/**", "dist/**"],
  },
  // apply to TypeScript files
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: require("@typescript-eslint/parser"),
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[regex]",
          message:
            "Regex literals are banned. Use string APIs or parsing utilities instead.",
        },
        {
          selector: "NewExpression[callee.name='RegExp']",
          message:
            "RegExp constructor is banned. Use string APIs or parsing utilities instead.",
        },
        {
          selector: "CallExpression[callee.name='RegExp']",
          message:
            "RegExp call is banned. Use string APIs or parsing utilities instead.",
        },
        {
          selector: "ThrowStatement",
          message:
            "Usage of 'throw' is banned. Use Result<T, X> for error handling instead.",
        },
        {
          selector: "Literal[value=null]",
          message: "Usage of 'null' is banned. Use 'undefined' instead.",
        },
        {
          selector: "Identifier[name='todo']",
          message: "The identifier 'todo' is banned.",
        },
      ],
      "no-eval": "error",
      "max-depth": ["error", 2],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];
