// Reports a type that is used in an exported declaration's signature or
// definition but is declared in this file without being exported. Such a
// type cannot be named by callers, so it must be exported too.
import type { TSESLint, TSESTree } from "@typescript-eslint/utils";

interface Usage {
  name: string;
  node: TSESTree.Identifier;
  owner: string;
}

// The closest exported declaration that contains the node, or undefined.
function enclosingExport(
  node: TSESTree.Node,
): TSESTree.ExportNamedDeclaration | undefined {
  let cur: TSESTree.Node | undefined = node.parent ?? undefined;
  while (cur !== undefined) {
    if (cur.type === "ExportNamedDeclaration") return cur;
    cur = cur.parent ?? undefined;
  }
  return undefined;
}

// The name of the declaration an export statement exports, for messages.
function ownerName(exported: TSESTree.ExportNamedDeclaration): string {
  const { declaration } = exported;
  if (declaration === null) return "export";
  if (declaration.type === "VariableDeclaration") return "variable";
  const { id } = declaration;
  if (id?.type === "Identifier") return id.name;
  return "default";
}

// The name a top-level declaration introduces, or undefined for other statements.
function declaredName(statement: TSESTree.Node): string | undefined {
  if (
    statement.type === "TSInterfaceDeclaration" ||
    statement.type === "TSTypeAliasDeclaration" ||
    statement.type === "TSEnumDeclaration" ||
    statement.type === "FunctionDeclaration" ||
    statement.type === "ClassDeclaration"
  ) {
    const { id } = statement;
    return id?.name;
  }
  return undefined;
}

type MessageIds = string;

const exportReferencedTypes: TSESLint.RuleModule<MessageIds, []> = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Types used in an exported declaration must also be exported.",
    },
    schema: [],
    messages: {
      notExported:
        'Type "{{name}}" is used in exported "{{owner}}" and should also be exported.',
    },
  },
  defaultOptions: [],
  create(context) {
    const usages: Usage[] = [];
    const typeParamNames = new Set<string>();

    return {
      TSTypeReference(node: TSESTree.TSTypeReference) {
        const { typeName } = node;
        if (typeName.type !== "Identifier") return;
        const owner = enclosingExport(node);
        if (owner === undefined) return;
        usages.push({
          name: typeName.name,
          node: typeName,
          owner: ownerName(owner),
        });
      },
      TSTypeParameter(node: TSESTree.TSTypeParameter) {
        const { name } = node;
        typeParamNames.add(name.name);
      },
      "Program:exit"() {
        const { sourceCode } = context;
        const { ast } = sourceCode;
        const { body } = ast;
        const exportedNames = new Set<string>();
        const privateNames = new Set<string>();
        for (const statement of body) {
          if (statement.type === "ExportNamedDeclaration") {
            const { declaration, specifiers } = statement;
            if (declaration !== null) {
              const name = declaredName(declaration);
              if (name !== undefined) exportedNames.add(name);
            }
            for (const specifier of specifiers) {
              const { local } = specifier;
              if (local.type === "Identifier") exportedNames.add(local.name);
            }
          } else {
            const name = declaredName(statement);
            if (name !== undefined) privateNames.add(name);
          }
        }
        for (const usage of usages) {
          const { name } = usage;
          if (!privateNames.has(name)) continue;
          if (exportedNames.has(name) || typeParamNames.has(name)) continue;
          context.report({
            node: usage.node,
            messageId: "notExported",
            data: { name, owner: usage.owner },
          });
        }
      },
    };
  },
};

export default exportReferencedTypes;
