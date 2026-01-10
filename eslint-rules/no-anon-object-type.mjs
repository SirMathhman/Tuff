export default {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow anonymous object types, use named interfaces instead",
      category: "Best Practices",
    },
    messages: {
      noAnonObjectType:
        "Do not use anonymous object types. Define a named interface or type alias instead.",
    },
  },
  create(context) {
    return {
      TSTypeLiteral(node) {
        // Check if this is a standalone type (not an interface extending it)
        const parent = node.parent;
        if (
          parent.type === "TSTypeAliasDeclaration" &&
          parent.typeAnnotation === node
        ) {
          return; // This is fine - it's assigned to a named type alias
        }
        if (parent.type === "TSInterfaceDeclaration") {
          return; // This is fine - it's part of an interface
        }

        context.report({
          node,
          messageId: "noAnonObjectType",
        });
      },
    };
  },
};
