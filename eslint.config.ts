import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

const { configs: jsConfigs } = eslint;
const { configs: tsConfigs } = tseslint;
import jsdoc from "eslint-plugin-jsdoc";
import maxInterfaceMembers from "./eslint-rules/max-interface-members";
import exportReferencedTypes from "./eslint-rules/export-referenced-types";
import requireMemberDocs from "./eslint-rules/require-member-docs";
import noRecursion from "./eslint-rules/no-recursion";

export default tseslint.config(
  { ignores: ["node_modules/**"] },
  jsConfigs.recommended,
  tsConfigs.recommended,
  {
    plugins: {
      local: {
        rules: {
          "no-recursion": noRecursion,
          "max-interface-members": maxInterfaceMembers,
          "require-member-docs": requireMemberDocs,
          "export-referenced-types": exportReferencedTypes,
        },
      },
      jsdoc,
    },
    rules: {
      "local/no-recursion": "error",
      "local/max-interface-members": "error",
      "local/require-member-docs": "error",
      "local/export-referenced-types": "error",
      "id-length": ["error", { min: 2 }],
      "max-lines": [
        "error",
        { max: 500, skipBlankLines: true, skipComments: true },
      ],
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
          selector: "MemberExpression[object.type='MemberExpression']",
          message:
            "Member chains such as a.b.c are not allowed; access one level at a time.",
        },
        {
          selector: "TSNullKeyword",
          message:
            "The null type is not allowed; use undefined or a named type instead.",
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
