/**
 * ESLint rule: no-object-indexing
 * Bans the use of object indexing signatures like [k: string]: RuntimeValue
 * Encourages using Map instead for dynamic key-value storage.
 */

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Ban object indexing signatures",
      category: "Best Practices",
      recommended: true,
    },
    messages: {
      objectIndexing:
        "Object indexing signatures [k: string]: T are banned. Use Map<K, V> instead for dynamic key-value storage.",
    },
    schema: [],
  },

  create(context) {
    return {
      // Check for TSIndexSignature in interfaces and object types
      TSIndexSignature(node) {
        // Get the parameters array
        if (!node.parameters || node.parameters.length === 0) {
          return;
        }

        const indexParam = node.parameters[0];

        // Check if parameter has a type annotation
        if (!indexParam.typeAnnotation) {
          return;
        }

        const typeAnnotation = indexParam.typeAnnotation.typeAnnotation;

        // Check if it's a string type (TSStringKeyword or TSKeywordType with value 'string')
        if (typeAnnotation.type === "TSStringKeyword") {
          context.report({
            node: node,
            messageId: "objectIndexing",
          });
          return;
        }

        // Also check for TSKeywordType with value === "string"
        if (
          typeAnnotation.type === "TSKeywordType" &&
          typeAnnotation.value === "string"
        ) {
          context.report({
            node: node,
            messageId: "objectIndexing",
          });
          return;
        }
      },
    };
  },
};
