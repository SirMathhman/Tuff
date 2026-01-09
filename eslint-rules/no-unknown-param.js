/**
 * @fileoverview Ban 'unknown' type in function parameter types
 * @author SirMathhman
 */
"use strict";

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "disallow 'unknown' type in function parameter types",
      recommended: false,
    },
    fixable: null,
    schema: [],
    messages: {
      noUnknownParam:
        "Parameter '{{paramName}}' should not have 'unknown' type. Use a more specific type like RuntimeValue instead.",
    },
  },

  create(context) {
    // Track checked nodes to prevent duplicate reports
    const checkedNodes = new Set();

    return {
      "FunctionDeclaration, FunctionExpression, ArrowFunctionExpression, TSMethodSignature, TSDeclareFunction"(
        node
      ) {
        // Check each parameter
        if (node.params) {
          for (const param of node.params) {
            checkParameter(param);
          }
        }
      },
    };

    function checkParameter(param) {
      // Skip if already checked
      if (checkedNodes.has(param)) return;
      checkedNodes.add(param);

      // Handle identifier parameters with type annotations
      if (param.type === "Identifier" && param.typeAnnotation) {
        checkTypeAnnotation(param, param.name);
      }
      // Handle rest parameters
      else if (param.type === "RestElement" && param.typeAnnotation) {
        const paramName =
          param.argument.type === "Identifier" ? param.argument.name : "param";
        checkTypeAnnotation(param, paramName);
      }
      // Handle assignment patterns (default parameters)
      else if (
        param.type === "AssignmentPattern" &&
        param.left.typeAnnotation
      ) {
        const paramName =
          param.left.type === "Identifier" ? param.left.name : "param";
        checkTypeAnnotation(param.left, paramName);
      }
    }

    function checkTypeAnnotation(param, paramName) {
      const typeAnnotation = param.typeAnnotation;
      if (!typeAnnotation || !typeAnnotation.typeAnnotation) return;

      const typeNode = typeAnnotation.typeAnnotation;

      // Check if the type is 'unknown'
      if (typeNode.type === "TSUnknownKeyword") {
        context.report({
          node: typeNode,
          messageId: "noUnknownParam",
          data: {
            paramName: paramName || "parameter",
          },
        });
      }
    }
  },
};
