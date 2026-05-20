"use strict";

/**
 * Generate a normalized key for an AST expression node.
 * This captures the "shape" of the expression for duplicate detection.
 */
function expressionKey(node) {
  if (!node || typeof node !== "object") return "";
  switch (node.type) {
    case "Literal":
      return "Literal:" + String(node.value);
    case "Identifier":
      return "Identifier:" + node.name;
    case "UnaryExpression":
      return (
        "UnaryExpression:" +
        node.operator +
        "(" +
        expressionKey(node.argument) +
        ")"
      );
    case "BinaryExpression":
    case "LogicalExpression":
      return (
        "BinaryExpression:" +
        node.operator +
        "(" +
        expressionKey(node.left) +
        "," +
        expressionKey(node.right) +
        ")"
      );
    case "ConditionalExpression":
      return (
        "ConditionalExpression:" +
        expressionKey(node.test) +
        "?" +
        expressionKey(node.consequent) +
        ":" +
        expressionKey(node.alternate)
      );
    case "CallExpression":
      return (
        "CallExpression:" +
        expressionKey(node.callee) +
        "(" +
        node.arguments.map(expressionKey).join(",") +
        ")"
      );
    case "MemberExpression":
      // Treat a.b (non-computed, dot notation) as a primitive when `a` is an identifier
      if (!node.computed && node.object.type === "Identifier") {
        return (
          "MemberPrimitive:" +
          node.object.name +
          "." +
          expressionKey(node.property)
        );
      }
      return (
        "MemberExpression:" +
        expressionKey(node.object) +
        "." +
        (node.computed
          ? "[" + expressionKey(node.property) + "]"
          : expressionKey(node.property))
      );
    case "ArrayExpression":
      return (
        "ArrayExpression:[" + node.elements.map(expressionKey).join(",") + "]"
      );
    case "ObjectExpression":
      return (
        "ObjectExpression:{" +
        node.properties
          .map(function (p) {
            return expressionKey(p.key) + ":" + expressionKey(p.value);
          })
          .join(",") +
        "}"
      );
    case "TemplateLiteral":
      return (
        "TemplateLiteral:" +
        node.quasis
          .map(function (q) {
            return q.value.cooked;
          })
          .join("${}")
      );
    case "SpreadElement":
      return "SpreadElement:" + expressionKey(node.argument);
    case "SequenceExpression":
      return (
        "SequenceExpression:" + node.expressions.map(expressionKey).join(",")
      );
    case "NewExpression":
      return (
        "NewExpression:" +
        expressionKey(node.callee) +
        "(" +
        node.arguments.map(expressionKey).join(",") +
        ")"
      );
    case "ThisExpression":
      return "ThisExpression";
    case "UpdateExpression":
      return (
        "UpdateExpression:" +
        node.operator +
        "(" +
        expressionKey(node.argument) +
        ")"
      );
    case "AssignmentExpression":
      return (
        "AssignmentExpression:" +
        node.operator +
        "(" +
        expressionKey(node.left) +
        "," +
        expressionKey(node.right) +
        ")"
      );
    case "ArrowFunctionExpression":
    case "FunctionExpression":
      return (
        "FunctionExpression:(" + node.params.map(expressionKey).join(",") + ")"
      );
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
        "Flag duplicated expressions. Encourage extracting into a local declaration or renaming identifiers.",
    },
    schema: [],
    messages: {
      duplicateExpression:
        "Duplicate expression '{{expr}}' appears {{count}} times. Consider extracting it into a hoisted local declaration, or rename identifiers to make them distinct.",
    },
  },
  create: function (context) {
    // A size-1 expression is flat: all its children are leaves (Literal, Identifier, ThisExpression)
    // or themselves size-1. These aren't worth extracting.
    function isSize1(node) {
      if (!node || typeof node !== "object") return true;
      if (node.type === "Literal") return true;
      if (node.type === "Identifier") return true;
      if (node.type === "ThisExpression") return true;
      if (node.type === "UnaryExpression" || node.type === "UpdateExpression")
        return isSize1(node.argument);
      if (node.type === "AssignmentExpression")
        return isSize1(node.left) && isSize1(node.right);
      if (node.type === "BinaryExpression" || node.type === "LogicalExpression")
        return isSize1(node.left) && isSize1(node.right);
      if (node.type === "MemberExpression")
        return isSize1(node.object) && isSize1(node.property);
      if (node.type === "ConditionalExpression")
        return (
          isSize1(node.test) &&
          isSize1(node.consequent) &&
          isSize1(node.alternate)
        );
      if (node.type === "CallExpression" || node.type === "NewExpression") {
        if (!isSize1(node.callee)) return false;
        for (var i = 0; i < node.arguments.length; i++) {
          if (!isSize1(node.arguments[i])) return false;
        }
        return true;
      }
      if (node.type === "ArrayExpression") {
        for (var i = 0; i < node.elements.length; i++) {
          if (!isSize1(node.elements[i])) return false;
        }
        return true;
      }
      return false;
    }
    var entries = [];
    var sourceCode = context.sourceCode;

    function visit(node) {
      if (!node || typeof node !== "object") return;
      if (!node.type) return;
      // Deduplicate by node reference — :expression can visit same node multiple times
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].node === node) return;
      }
      var key = expressionKey(node);
      entries.push({ node: node, key: key, range: node.range });
    }

    return {
      ":expression": function (node) {
        // Skip size-1 expressions — flat, no extractable sub-structure
        if (isSize1(node)) return;
        // Skip function bodies — too large
        if (
          node.type === "ArrowFunctionExpression" ||
          node.type === "FunctionExpression"
        )
          return;

        visit(node);
      },
      "Program:exit": function () {
        // Group by key
        var grouped = Object.create(null);
        for (var i = 0; i < entries.length; i++) {
          var e = entries[i];
          if (!grouped[e.key]) grouped[e.key] = [];
          grouped[e.key].push(e);
        }

        var keys = Object.keys(grouped);
        for (var k = 0; k < keys.length; k++) {
          var group = grouped[keys[k]];
          if (group.length < 2) continue;

          // Filter out nodes that are nested inside another node with the same key
          var filtered = [];
          for (var a = 0; a < group.length; a++) {
            var outer = true;
            for (var b = 0; b < group.length; b++) {
              if (a === b) continue;
              // Check if group[b] fully contains group[a]
              if (
                group[b].range[0] <= group[a].range[0] &&
                group[b].range[1] >= group[a].range[1]
              ) {
                outer = false;
                break;
              }
            }
            if (outer) filtered.push(group[a]);
          }

          if (filtered.length < 2) continue;

          var source = sourceCode.getText(filtered[0].node);
          for (var m = 0; m < filtered.length; m++) {
            context.report({
              node: filtered[m].node,
              messageId: "duplicateExpression",
              data: {
                expr: source.length > 40 ? source.slice(0, 37) + "..." : source,
                count: filtered.length,
              },
            });
          }
        }
      },
    };
  },
};
