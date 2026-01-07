import js from "@eslint/js";
import tseslint from "typescript-eslint";

const noRecordRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow Record type, use Map instead",
    },
  },
  create(context) {
    return {
      TSTypeReference(node) {
        if (node.typeName.name === "Record") {
          context.report({
            node,
            message: "Do not use Record type. Use Map instead.",
          });
        }
      },
    };
  },
};

const noNullRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow null, use undefined instead",
    },
  },
  create(context) {
    return {
      Literal(node) {
        if (node.value === null) {
          context.report({
            node,
            message: "Do not use null. Use undefined instead.",
          });
        }
      },
    };
  },
};

const customPlugin = {
  rules: {
    "no-record": noRecordRule,
    "no-null": noNullRule,
  },
};

export default [
  {
    ignores: ["node_modules/", "dist/", "coverage/"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
        ecmaVersion: 2020,
        sourceType: "module",
      },
    },
    plugins: {
      custom: customPlugin,
    },
    rules: {
      complexity: ["error", 15],
      "custom/no-record": "error",
      "custom/no-null": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
];
