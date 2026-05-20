"use strict";

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Suggest inlining functions that are only used once",
    },
    fixable: "code",
    schema: [],
    messages: {
      inlineSuggestion:
        "Function '{{name}}' is only used once. Consider inlining it.",
    },
  },
  create(context) {
    const functionUsages = new Map();

    return {
      FunctionDeclaration(node) {
        if (node.id) {
          functionUsages.set(node.id.name, { declaration: node, count: 0 });
        }
      },

      Identifier(node) {
        const parent = node.parent;

        // Skip the function declaration name itself
        if (
          parent &&
          (parent.type === "FunctionDeclaration" ||
            parent.type === "FunctionExpression") &&
          parent.id === node
        ) {
          return;
        }

        if (functionUsages.has(node.name)) {
          functionUsages.get(node.name).count++;
        }
      },

      "Program:exit"() {
        for (const [name, { declaration, count }] of functionUsages) {
          if (count === 1) {
            context.report({
              node: declaration,
              messageId: "inlineSuggestion",
              data: { name },
            });
          }
        }
      },
    };
  },
};
