import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: ["dist", "node_modules"],
  },
  {
    files: ["src/**/*.{ts,js}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: tsParser,
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      "no-unused-vars": "error",
      "@typescript-eslint/no-unused-vars": "warn",
      "no-restricted-syntax": [
        "error",
        {
          selector: "TemplateLiteral",
          message:
            "Template strings are not allowed because they tend to be false flagged by PMD CPD. Use simple string concatenation instead.",
        },
        {
          selector: "ForStatement",
          message: "Use array methods like map/reduce instead of loops.",
        },
        {
          selector: "ForInStatement",
          message: "Use array methods like map/reduce instead of loops.",
        },
        {
          selector: "ForOfStatement",
          message: "Use array methods like map/reduce instead of loops.",
        },
        {
          selector: "WhileStatement",
          message: "Use array methods like map/reduce instead of loops.",
        },
        {
          selector: "DoWhileStatement",
          message: "Use array methods like map/reduce instead of loops.",
        },
        {
          selector: "Literal[regex]",
          message: "Regexes are not allowed.",
        },
      ],
      "max-lines-per-function": [
        "error",
        { max: 50, skipBlankLines: true, skipComments: true },
      ],
    },
  },
];
