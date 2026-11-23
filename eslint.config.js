import tseslint from "typescript-eslint";

export default [
  {
    files: ["**/*.ts"],
    languageOptions: { parser: tseslint.parser },
    rules: {
      "max-lines": ["warn", 500],
      "max-lines-per-function": ["warn", 100],
      complexity: ["warn", 15],
    },
  },
];
