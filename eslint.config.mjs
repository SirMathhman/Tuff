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
      TSNullKeyword(node) {
        context.report({
          node,
          message: "Do not use null. Use undefined instead.",
        });
      },
    };
  },
};

const noAnyRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow any type, use unknown or explicit object types instead",
    },
  },
  create(context) {
    return {
      TSAnyKeyword(node) {
        context.report({
          node,
          message:
            "Do not use 'any'. Use an explicit object type or 'unknown' if you don't know the type.",
        });
      },
      TSAsExpression(node) {
        if (node.typeAnnotation.type === "TSAnyKeyword") {
          context.report({
            node: node.typeAnnotation,
            message:
              "Do not use 'any'. Use an explicit object type or 'unknown' if you don't know the type.",
          });
        }
      },
    };
  },
};

const noAnonymousObjectTypeRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow anonymous object types, use named interfaces instead",
    },
  },
  create(context) {
    return {
      TSTypeLiteral(node) {
        context.report({
          node,
          message: "Do not use anonymous object types. Define a named interface instead.",
        });
      },
    };
  },
};

const customPlugin = {
  rules: {
    "no-record": noRecordRule,
    "no-null": noNullRule,
    "no-any": noAnyRule,
    "no-anonymous-object-type": noAnonymousObjectTypeRule,
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
      "custom/no-any": "error",
      "custom/no-anonymous-object-type": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
];
