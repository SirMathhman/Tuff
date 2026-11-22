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
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[regex]",
          message: "Regex literals are not allowed. Use string methods instead.",
        },
      ],
    },
  },
);
