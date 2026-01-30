// @ts-check
const typescript = require("@typescript-eslint/eslint-plugin");
const parser = require("@typescript-eslint/parser");

module.exports = [
  {
    ignores: ["dist/", "node_modules/", "coverage/", "src/**/*.js"],
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser,
      parserOptions: {
        project: "./tsconfig.json",
        ecmaVersion: 2019,
        sourceType: "module",
      },
      globals: {
        console: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": typescript,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "no-console": "off",
      "max-lines": [
        "error",
        { max: 500, skipComments: true, skipBlankLines: true },
      ],
      "max-lines-per-function": ["error", { max: 50 }],
      "no-restricted-syntax": [
        "error",
        {
          selector: "TemplateLiteral",
          message:
            "Template literals are not allowed. Use string concatenation instead to avoid CPD (copy-paste detection) issues.",
        },
      ],
    },
  },
  {
    files: ["tests/**/*.ts"],
    languageOptions: {
      parser,
      parserOptions: {
        ecmaVersion: 2019,
        sourceType: "module",
      },
      globals: {
        console: "readonly",
        test: "readonly",
        expect: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": typescript,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "no-console": "off",
      "max-lines": [
        "error",
        { max: 500, skipComments: true, skipBlankLines: true },
      ],
      "max-lines-per-function": ["error", { max: 50 }],
    },
  },
];
