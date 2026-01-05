module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  env: {
    node: true,
    es6: true,
  },
  rules: {
    // Require semicolons for JS files
    semi: ["error", "always"],
  },
  overrides: [
    {
      files: ["**/*.ts"],
      rules: {
        // Ensure semicolons are enforced in TypeScript as well
        semi: ["error", "always"],
      },
    },
  ],
};
