import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["node_modules"],
  },
  tseslint.configs.base,
  {
    files: ["**/*.ts"],
    rules: {
      "max-lines-per-function": [
        "error",
        { max: 100, skipBlankLines: true, skipComments: true },
      ],
    },
  },
);
