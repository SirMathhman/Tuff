/**
 * ESLint rule to enforce a maximum number of union type members.
 * Prevents union types from becoming too large and unwieldy.
 *
 * @example
 * // Bad (exceeds max of 5)
 * type MyUnion = A | B | C | D | E | F;
 *
 * // Good (within max of 5)
 * type MyUnion = A | B | C | D | E;
 */

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce a maximum number of union type members (default: 5)",
      category: "Best Practices",
      recommended: true,
    },
    messages: {
      tooManyUnionMembers:
        "Union type '{{name}}' has {{count}} members, but the maximum allowed is {{max}}. Consider grouping related types or using inheritance.",
    },
    schema: [
      {
        type: "object",
        properties: {
          max: {
            type: "integer",
            minimum: 1,
            default: 5,
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const options = context.options[0] || {};
    const maxUnionMembers = options.max || 5;

    return {
      TSTypeAliasDeclaration(node) {
        // Only check union types
        if (node.typeAnnotation.type !== "TSUnionType") return;

        const unionMembers = node.typeAnnotation.types;
        const memberCount = unionMembers.length;

        if (memberCount > maxUnionMembers) {
          context.report({
            node,
            messageId: "tooManyUnionMembers",
            data: {
              name: node.id.name,
              count: memberCount,
              max: maxUnionMembers,
            },
          });
        }
      },
    };
  },
};
