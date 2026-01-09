/**
 * ESLint rule: max-interface-fields
 * Enforces a maximum number of fields (excluding methods) in TypeScript interfaces.
 */

module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Enforce a maximum number of fields (excluding methods) in interfaces",
      category: "Best Practices",
      recommended: false,
    },
    messages: {
      tooManyFields:
        "Interface '{{name}}' has {{count}} fields, but the maximum allowed is {{max}}. Methods are not counted.",
    },
    schema: [
      {
        type: "object",
        properties: {
          max: {
            type: "integer",
            minimum: 1,
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const maxFields = context.options[0]?.max ?? 5;

    return {
      TSInterfaceDeclaration(node) {
        const fields = [];

        // Count only property signatures (fields), not method signatures
        for (const member of node.body.body) {
          if (member.type === "TSPropertySignature") {
            fields.push(member);
          }
          // Ignore TSMethodSignature, TSCallSignatureDeclaration, etc.
        }

        if (fields.length > maxFields) {
          context.report({
            node: node.id,
            messageId: "tooManyFields",
            data: {
              name: node.id.name,
              count: fields.length,
              max: maxFields,
            },
          });
        }
      },
    };
  },
};
