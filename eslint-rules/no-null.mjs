export default {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow null, use undefined instead",
      category: "Best Practices",
    },
    messages: {
      noNull: "Do not use null. Use undefined instead.",
    },
  },
  create(context) {
    return {
      Literal(node) {
        if (node.value === null) {
          context.report({
            node,
            messageId: "noNull",
          });
        }
      },
    };
  },
};
