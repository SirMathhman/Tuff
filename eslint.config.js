import tseslint from "typescript-eslint";
import jsdoc from "eslint-plugin-jsdoc";

export default [
  {
    files: ["**/*.ts"],
    languageOptions: { parser: tseslint.parser },
    plugins: { jsdoc },
    rules: {
      "max-lines": ["warn", 500],
      "max-lines-per-function": ["warn", 100],
      complexity: ["warn", 15],
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: { ancestorsOnly: true },
          require: { FunctionDeclaration: true },
          contexts: ["TSInterfaceDeclaration", "TSPropertySignature"],
        },
      ],
      "jsdoc/require-param": "error",
      "jsdoc/require-returns": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSTypeLiteral",
          message: "Use an interface instead of an object type literal.",
        },
        {
          selector: "Literal[regex]",
          message: "Regex literals are not allowed.",
        },
        {
          selector: "NewExpression[callee.name='RegExp']",
          message: "new RegExp is not allowed.",
        },
        {
          selector: "CallExpression[callee.name='RegExp']",
          message: "RegExp() is not allowed.",
        },
        {
          selector: "ForStatement",
          message: "Use map or reduce instead of a for loop.",
        },
        {
          selector: "ForInStatement",
          message: "Use map or reduce instead of a for loop.",
        },
        {
          selector: "ForOfStatement",
          message: "Use map or reduce instead of a for loop.",
        },
      ],
    },
  },
];
