// Reports a field, method, or enum member of an exported interface or enum that
// has no JSDoc comment directly above it.
import type { TSESLint, TSESTree } from "@typescript-eslint/utils";

type MessageIds = string;

function memberName(member: TSESTree.TypeElement): string {
  if ("key" in member) {
    const { key } = member;
    if (key.type === "Identifier") return key.name;
  }
  return "<member>";
}

function enumMemberName(member: TSESTree.TSEnumMember): string {
  const { id } = member;
  if (id.type === "Identifier") return id.name;
  return "<member>";
}

const requireMemberDocs: TSESLint.RuleModule<MessageIds, []> = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Fields, methods, and enum members of exported interfaces and enums need JSDoc.",
    },
    schema: [],
    messages: {
      undocumented:
        'Member "{{name}}" of exported {{kind}} "{{owner}}" has no JSDoc comment.',
    },
  },
  defaultOptions: [],
  create(context) {
    const { sourceCode } = context;

    // True when the closest comment before the node is a JSDoc block.
    function isDocumented(node: TSESTree.Node): boolean {
      const comments = sourceCode.getCommentsBefore(node);
      const last = comments[comments.length - 1];
      if (last?.type !== "Block") return false;
      const { value } = last;
      return value.startsWith("*");
    }

    return {
      TSInterfaceDeclaration(node: TSESTree.TSInterfaceDeclaration) {
        const { parent, id, body } = node;
        if (parent?.type !== "ExportNamedDeclaration") return;
        for (const member of body.body) {
          if (!isDocumented(member)) {
            context.report({
              node: member,
              messageId: "undocumented",
              data: {
                name: memberName(member),
                kind: "interface",
                owner: id.name,
              },
            });
          }
        }
      },
      TSEnumDeclaration(node: TSESTree.TSEnumDeclaration) {
        const { parent, id, members } = node;
        if (parent?.type !== "ExportNamedDeclaration") return;
        for (const member of members) {
          if (!isDocumented(member)) {
            context.report({
              node: member,
              messageId: "undocumented",
              data: {
                name: enumMemberName(member),
                kind: "enum",
                owner: id.name,
              },
            });
          }
        }
      },
    };
  },
};

export default requireMemberDocs;
