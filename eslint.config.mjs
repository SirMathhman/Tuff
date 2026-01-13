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
          "selector": "Literal[regex]",
          "message": "Do not use regular expressions."
        },
        {
          "selector": "NewExpression[callee.name='RegExp']",
          "message": "Do not use regular expressions."
        }
      ]
    }
  }
];
