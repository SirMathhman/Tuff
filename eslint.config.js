import tseslint from "typescript-eslint";
import jsdoc from "eslint-plugin-jsdoc";

const DOC_REQUIRED_DECLARATIONS = ["TSInterfaceDeclaration", "TSTypeAliasDeclaration", "TSEnumDeclaration"];

const local = {
  rules: {
    "require-doc-on-exports": {
      meta: {
        type: "suggestion",
        messages: {
          missing: "Exported {{kind}} must have a JSDoc comment (/** ... */) directly above it.",
          missingMember: "Member of an exported declaration ({{kind}}) must have a JSDoc comment directly above it.",
        },
      },
      create(context) {
        const sourceCode = context.sourceCode;
        const hasJsdoc = (node) => {
          const last = sourceCode.getCommentsBefore(node).at(-1);
          return last !== undefined && last.type === "Block" && last.value.startsWith("*");
        };
        // Walks up from a member (enum member, interface property) to see whether its declaration is exported.
        const exportedContainer = (member) => {
          let current = member.parent;
          for (let depth = 0; depth < 3 && current; depth++) {
            if (current.parent?.type === "ExportNamedDeclaration") return current.type;
            current = current.parent;
          }
          return undefined;
        };
        return {
          ExportNamedDeclaration(node) {
            const declaration = node.declaration;
            if (declaration === null || !DOC_REQUIRED_DECLARATIONS.includes(declaration.type)) return;
            if (hasJsdoc(node)) return;
            context.report({ node, messageId: "missing", data: { kind: declaration.type } });
          },
          TSEnumMember(node) {
            if (exportedContainer(node) === undefined || hasJsdoc(node)) return;
            context.report({ node, messageId: "missingMember", data: { kind: "enum member" } });
          },
          TSPropertySignature(node) {
            if (exportedContainer(node) === undefined || hasJsdoc(node)) return;
            context.report({ node, messageId: "missingMember", data: { kind: "interface property" } });
          },
        };
      },
    },
  },
};

export default tseslint.config(
  {
    files: ["**/*.ts"],
    languageOptions: { parser: tseslint.parser },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSTypeLiteral",
          message: "Use an interface instead of an object type literal.",
        },
        {
          selector: "TSLiteralType > Literal[raw=/^[\"'`]/]",
          message: "Use an enum member instead of a string literal type.",
        },
        {
          selector: "VariableDeclarator[init.type='ArrowFunctionExpression']",
          message: "Use a function declaration instead of an arrow function assigned to a variable.",
        },
      ],
    },
  },
  {
    files: ["index.ts", "src/**/*.ts"],
    plugins: { jsdoc, local },
    rules: {
      "jsdoc/require-jsdoc": ["error", { publicOnly: true, require: { FunctionDeclaration: true } }],
      "jsdoc/require-param": "error",
      "jsdoc/require-returns": "error",
      "local/require-doc-on-exports": "error",
    },
  },
);
