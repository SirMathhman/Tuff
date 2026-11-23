// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["node_modules", "dist", "out", "coverage"],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      "func-style": ["error", "declaration", { allowArrowFunctions: false }],
      "@typescript-eslint/no-restricted-types": [
        "error",
        {
          types: {
            null: {
              message: "Use undefined instead of null in types.",
            },
          },
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[regex]",
          message: "Regex literals are not allowed. Use string methods instead.",
        },
        {
          selector: "ThrowStatement",
          message: "throw is not allowed. Return a Result instead.",
        },
        {
          selector: `TSUnionType > TSLiteralType > Literal[raw=/^["']/]`,
          message: "String literals in union types are not allowed. Use an enum instead.",
        },
        {
          selector: "TSUnionType > TSTemplateLiteralType",
          message: "Template literal types in union types are not allowed. Use an enum instead.",
        },
        {
          selector: "TSTypeLiteral",
          message: "Object type literals are not allowed. Declare a named interface instead.",
        },
      ],
    },
  },
);
