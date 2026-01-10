module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
  },
  env: {
    node: true,
    es2020: true,
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
  ],
  rules: {
    // Keep minimal rules for now; we can tighten these later
    "@typescript-eslint/no-explicit-any": "off",
    // Ban RegExp.test() using no-restricted-syntax
    "no-restricted-syntax": [
      "error",
      {
        selector:
          "CallExpression[callee.type='MemberExpression'][callee.property.name='test']",
        message:
          "RegExp.test() is banned. Use RegExp.exec() or string.match() instead.",
      },
    ],
  },
};
