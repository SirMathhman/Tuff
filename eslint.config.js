import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/**"] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
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
          selector: "CallExpression[callee.name='RegExp']",
          message: "Calling RegExp as a function is not allowed.",
        },
        {
          selector: "CallExpression[callee.property.name=/^(match|matchAll|search)$/]",
          message: "String match, matchAll, and search can create a RegExp; they are not allowed.",
        },
      ],
    },
  },
);
