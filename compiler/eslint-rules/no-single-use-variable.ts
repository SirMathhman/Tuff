import { Project, Node } from "ts-morph";
import type { Rule } from "eslint";

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow local variables that are only read once — inline the initializer at the use site instead.",
    },
    schema: [],
    messages: {
      shouldBeInlined:
        "Variable '{{name}}' is only used once. Inline its initializer at the use site instead.",
    },
  },
  create(context) {
    const filename = context.filename;
    const code = context.sourceCode.getText();

    const sourceFile = new Project({
      skipAddingFilesFromTsConfig: true,
      useInMemoryFileSystem: true,
    }).createSourceFile(filename, code, {
      overwrite: true,
    });

    return {
      VariableDeclarator(node) {
        if (node.id.type !== "Identifier") return;
        const varName = node.id.name;

        const declarations = sourceFile
          .getVariableDeclarations()
          .filter((d) => d.getName() === varName);
        if (declarations.length === 0) return;
        const declaration = declarations[0];
        if (!declaration) return;

        // Skip exported variables — they may be read from outside this file.
        const varStatement = declaration.getVariableStatement();
        if (varStatement && varStatement.isExported()) return;

        const nameNode = declaration.getNameNode();
        if (!Node.isIdentifier(nameNode)) return;

        const refs = nameNode
          .findReferencesAsNodes()
          .filter((ref) => ref !== nameNode);

        if (refs.length === 1) {
          context.report({
            node: node.id,
            messageId: "shouldBeInlined",
            data: { name: varName },
          });
        }
      },
    };
  },
} satisfies Rule.RuleModule;
