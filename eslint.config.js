import tseslint from "typescript-eslint";
import jsdoc from "eslint-plugin-jsdoc";

export default tseslint.config(
  {
    ignores: ["node_modules/"],
  },
  {
    files: ["**/*.ts"],
    extends: [tseslint.configs.recommended],
    languageOptions: { parser: tseslint.parser },
    plugins: { jsdoc },
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-nested-ternary": "error",
      "id-length": ["error", { min: 2 }],
      "max-lines": ["error", { max: 1000, skipComments: true, skipBlankLines: true }],
      "no-restricted-syntax": [
        "error",
        {
          selector: "ThrowStatement",
          message: "Return a Result (see src/result.ts) instead of throwing.",
        },
        {
          selector: "ForStatement[init=null][test=null][update=null]",
          message: "Do not use for(;;); use while (true) instead.",
        },
        {
          selector:
            "Program > :matches(FunctionDeclaration, ExportNamedDeclaration:has(> FunctionDeclaration)) ~ :matches(TSInterfaceDeclaration, TSTypeAliasDeclaration, ExportNamedDeclaration:has(> TSInterfaceDeclaration), ExportNamedDeclaration:has(> TSTypeAliasDeclaration))",
          message: "Declare types and interfaces above the functions that use them.",
        },
        {
          selector:
            ":matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression) > Identifier > TSTypeAnnotation > TSUnionType > TSUndefinedKeyword",
          message: "Do not use | undefined in parameter types; make the parameter optional or pass a value.",
        },
        {
          selector: "TSInterfaceBody > TSPropertySignature:has(TSUndefinedKeyword)",
          message: "Declare the member optional (name?: Type) instead of using | undefined.",
        },
        {
          selector: "TSTypeLiteral",
          message: "Do not use inline object types; declare a named interface instead.",
        },
        {
          selector: "ClassDeclaration",
          message: "Do not declare classes; use functions and plain objects instead.",
        },
      ],
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: { FunctionDeclaration: true },
          contexts: ["TSInterfaceDeclaration", "TSTypeAliasDeclaration", "TSEnumDeclaration", "TSPropertySignature", "TSEnumMember"],
        },
      ],
      "jsdoc/require-param": "error",
      "jsdoc/require-returns": "error",
    },
  },
);
