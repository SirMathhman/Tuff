module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
    warnOnUnsupportedTypeScriptVersion: false,
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
    // Ban RegExp.test() and RegExp.exec() using no-restricted-syntax
    "no-restricted-syntax": [
      "error",
      {
        selector: "Literal[regex]",
        message: "Regular expressions are banned. Do not use regexes.",
      },
      {
        selector:
          "NewExpression[callee.name='RegExp']",
        message:
          "RegExp constructor is banned. Do not use regexes.",
      },
      {
        selector:
          "CallExpression[callee.name='RegExp']",
        message:
          "RegExp constructor is banned. Do not use regexes.",
      },
      {
        selector:
          "CallExpression[callee.type='MemberExpression'][callee.property.name='test']",
        message: "RegExp.test() is banned. Do not use regexes.",
      },
      {
        selector:
          "CallExpression[callee.type='MemberExpression'][callee.property.name='exec']",
        message: "RegExp.exec() is banned. Do not use regexes.",
      },
    ],
  },
};
