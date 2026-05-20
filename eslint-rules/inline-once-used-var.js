"use strict";

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Suggest inlining let/const variables that are only used once",
    },
    schema: [],
    messages: {
      inlineSuggestion:
        "Variable '{{name}}' is only used once. Consider inlining it.",
    },
  },
  create(context) {
    const variables = new Map();

    return {
      VariableDeclarator(node) {
        if (node.id && node.id.type === "Identifier") {
          const name = node.id.name;
          if (!variables.has(name)) {
            variables.set(name, { node, count: 0 });
          }
        }
      },

      Identifier(node) {
        const parent = node.parent;

        // Skip the declaration name itself
        if (
          parent &&
          (parent.type === "VariableDeclarator" ||
            parent.type === "FunctionDeclaration" ||
            parent.type === "FunctionExpression") &&
          parent.id === node
        ) {
          return;
        }

        if (variables.has(node.name)) {
          variables.get(node.name).count++;
        }
      },

      "Program:exit"() {
        for (const [name, { node, count }] of variables) {
          if (count === 1) {
            context.report({
              node,
              messageId: "inlineSuggestion",
              data: { name },
            });
          }
        }
      },
    };
  },
};
