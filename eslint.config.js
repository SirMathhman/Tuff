import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["**/*.ts", "**/*.js"],
    languageOptions: {
      parser: tsParser,
    },
    rules: {
      "no-unused-vars": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[regex]",
          message: "Regex literals are not allowed",
        },
        {
          selector: "TemplateLiteral",
          message: "Template strings are not allowed",
        },
      ],
    },
  },
];
