import { Project } from "ts-morph";
import type { Rule } from "eslint";

const project = new Project({
  skipAddingFilesFromTsConfig: true,
  useInMemoryFileSystem: true,
});

const rule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow functions that are only called once — inline them instead.",
    },
    schema: [],
    messages: {
      shouldBeInlined:
        "Function '{{name}}' is only called once. Inline it at the call site instead.",
    },
  },
  create(context) {
    const filename = context.filename;
    const code = context.sourceCode.getText();

    const sourceFile = project.createSourceFile(filename, code, {
      overwrite: true,
    });

    return {
      FunctionDeclaration(node) {
        if (!node.id) return;
        const funcName = node.id.name;

        const declarations = sourceFile
          .getFunctions()
          .filter((f) => f.getName() === funcName);
        if (declarations.length === 0) return;
        const declaration = declarations[0];
        if (!declaration) return;

        // Skip exported functions — they may be called from outside this file.
        if (declaration.isExported()) return;

        const refs = declaration
          .getNameNodeOrThrow()
          .findReferencesAsNodes()
          .filter((ref) => ref !== declaration.getNameNodeOrThrow());

        if (refs.length === 1) {
          context.report({
            node: node.id,
            messageId: "shouldBeInlined",
            data: { name: funcName },
          });
        }
      },
    };
  },
};

export default rule;
