"use strict";

/**
 * Generate a normalized key for an AST expression node.
 * This captures the "shape" of the expression for duplicate detection.
 */
function expressionKey(node) {
  if (!node || typeof node !== "object") return "";
  switch (node.type) {
    case "Literal":
      return `Literal:${String(node.value)}`;
    case "Identifier":
      return `Identifier:${node.name}`;
    case "UnaryExpression":
      return `UnaryExpression:${node.operator}(${expressionKey(node.argument)})`;
    case "BinaryExpression":
    case "LogicalExpression":
      return `BinaryExpression:${node.operator}(${expressionKey(node.left)},${expressionKey(node.right)})`;
    case "ConditionalExpression":
      return `ConditionalExpression:${expressionKey(node.test)}?${expressionKey(node.consequent)}:${expressionKey(node.alternate)}`;
    case "CallExpression":
      return `CallExpression:${expressionKey(node.callee)}(${node.arguments.map(expressionKey).join(",")})`;
    case "MemberExpression":
      return `MemberExpression:${expressionKey(node.object)}.${node.computed ? "[" + expressionKey(node.property) + "]" : expressionKey(node.property)}`;
    case "ArrayExpression":
      return `ArrayExpression:[${node.elements.map(expressionKey).join(",")}]`;
    case "ObjectExpression":
      return `ObjectExpression:{${node.properties.map((p) => expressionKey(p.key) + ":" + expressionKey(p.value)).join(",")}}`;
    case "TemplateLiteral":
      return `TemplateLiteral:${node.quasis.map((q) => q.value.cooked).join("${}")}`;
    case "SpreadElement":
      return `SpreadElement:${expressionKey(node.argument)}`;
    case "SequenceExpression":
      return `SequenceExpression:${node.expressions.map(expressionKey).join(",")}`;
    case "NewExpression":
      return `NewExpression:${expressionKey(node.callee)}(${node.arguments.map(expressionKey).join(",")})`;
    case "ThisExpression":
      return "ThisExpression";
    case "ArrowFunctionExpression":
    case "FunctionExpression":
      // Skip function bodies in the key to avoid over-matching
      return `FunctionExpression:(${node.params.map(expressionKey).join(",")})`;
    default:
      return node.type || "";
  }
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Flag duplicated expressions across variable declarations. Encourage extracting into a local declaration or renaming identifiers.",
    },
    schema: [],
    messages: {
      duplicateExpression:
        "Duplicate expression '{{expr}}' appears {{count}} times. Consider extracting it into a hoisted local declaration, or rename identifiers to make them distinct.",
    },
  },
  create(context) {
    // Map from expression key -> { nodes: [AST node, ...], source: string }
    const expressionMap = new Map();

    const sourceCode = context.sourceCode;

    return {
      VariableDeclarator(node) {
        if (!node.init) return;
        // Only consider let/const declarations
        const kind = node.parent && node.parent.kind;
        if (kind !== "let" && kind !== "const") return;

        const key = expressionKey(node.init);
        if (!expressionMap.has(key)) {
          expressionMap.set(key, { nodes: [], source: "" });
        }
        const entry = expressionMap.get(key);
        entry.nodes.push(node.init);
        if (!entry.source) {
          entry.source = sourceCode.getText(node.init);
        }
      },

      "Program:exit"() {
        for (const [key, { nodes, source }] of expressionMap) {
          if (nodes.length > 1) {
            // Skip trivial constants like 0, 1, true, false, null, ""
            if (
              key === "Literal:0" ||
              key === "Literal:1" ||
              key === "Literal:true" ||
              key === "Literal:false" ||
              key === "Literal:null" ||
              key === 'Literal:""'
            ) {
              continue;
            }
            // Report on all occurrences
            for (const node of nodes) {
              context.report({
                node,
                messageId: "duplicateExpression",
                data: {
                  expr:
                    source.length > 40 ? source.slice(0, 37) + "..." : source,
                  count: nodes.length,
                },
              });
            }
          }
        }
      },
    };
  },
};
