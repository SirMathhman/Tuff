import tseslint from "typescript-eslint";

export default tseslint.config({
  files: ["**/*.ts"],
  languageOptions: { parser: tseslint.parser },
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "TSTypeLiteral",
        message: "Use an interface instead of an object type literal.",
      },
    ],
  },
});
