import tseslint from "typescript-eslint";

export default [
  {
    files: ["**/*.ts"],
    languageOptions: { parser: tseslint.parser },
    rules: {
      "max-lines": ["warn", 500],
      "max-lines-per-function": ["warn", 100],
      complexity: ["warn", 15],
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSTypeLiteral",
          message: "Use an interface instead of an object type literal.",
        },
      ],
    },
  },
];
