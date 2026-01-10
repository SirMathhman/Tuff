export default {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow Record type, use Map instead",
      category: "Best Practices",
    },
    messages: {
      noRecord: "Do not use Record type. Use Map instead.",
    },
  },
  create(context) {
    return {
      TSTypeReference(node) {
        if (
          node.typeName.type === "Identifier" &&
          node.typeName.name === "Record"
        ) {
          context.report({
            node,
            messageId: "noRecord",
          });
        }
      },
    };
  },
};
