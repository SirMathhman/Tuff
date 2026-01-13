import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[regex]",
          message: "Do not use regular expressions.",
        },
        {
          selector: "NewExpression[callee.name='RegExp']",
          message: "Do not use regular expressions.",
        },
        {
          selector: "ThrowStatement",
          message: "Do not use the 'throw' keyword. Use a Result instead.",
        },
        {
          selector: "TSTypeLiteral",
          message:
            "Do not use anonymous object types. Prefer named interfaces.",
        },
      ],
      "max-depth": ["error", 2],
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
    },
  },
];
