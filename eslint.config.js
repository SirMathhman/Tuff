import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import jsdoc from "eslint-plugin-jsdoc";
import noRecursion from "./eslint-rules/no-recursion.js";

export default tseslint.config(
  { ignores: ["node_modules/**"] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    plugins: {
      local: { rules: { "no-recursion": noRecursion } },
      jsdoc,
    },
    rules: {
      "local/no-recursion": "error",
      // Exported top-level members must have JSDoc, with @param names and @returns.
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            ClassDeclaration: true,
          },
          contexts: [
            "TSInterfaceDeclaration",
            "TSTypeAliasDeclaration",
            "TSEnumDeclaration",
          ],
        },
      ],
      "jsdoc/require-param": "error",
      "jsdoc/require-returns": "error",
      "max-lines-per-function": [
        "error",
        { max: 100, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[regex]",
          message: "Regex literals are not allowed.",
        },
        {
          selector: "NewExpression[callee.name='RegExp']",
          message: "Constructing RegExp objects is not allowed.",
        },
        {
          selector: "TSTypeLiteral",
          message: "Use a named interface instead of an object type literal.",
        },
        {
          selector: "TSLiteralType > Literal[raw=/^[\"']/]",
          message: "String literal types are not allowed; use an enum.",
        },
        {
          selector: "CallExpression[callee.name='RegExp']",
          message: "Calling RegExp as a function is not allowed.",
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(match|matchAll|search)$/]",
          message:
            "String match, matchAll, and search can create a RegExp; they are not allowed.",
        },
      ],
    },
  },
);
