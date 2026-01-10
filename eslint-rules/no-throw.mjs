export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow throwing errors, use Result<T, E> instead",
      category: "Best Practices",
    },
    messages: {
      noThrow:
        "Do not throw errors. Use Result<T, E> pattern instead.",
    },
  },
  create(context) {
    return {
      ThrowStatement(node) {
        context.report({
          node,
          messageId: "noThrow",
        });
      },
    };
  },
};
