/**
 * ESLint rule: no-unknown-return
 * Bans the use of 'unknown' as a function return type.
 * Encourages using more specific types for better type safety.
 */

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Ban 'unknown' in function return types",
      category: "Best Practices",
      recommended: true,
    },
    messages: {
      unknownReturn:
        "Function return type 'unknown' is banned. Use a more specific type or RuntimeValue.",
    },
    schema: [],
  },

  create(context) {
    const checkedNodes = new Set();

    function checkFunctionReturnType(node) {
      // Avoid checking the same node twice
      if (checkedNodes.has(node)) {
        return;
      }
      checkedNodes.add(node);

      if (!node.returnType) {
        return;
      }

      const returnTypeAnnotation = node.returnType.typeAnnotation;
      if (!returnTypeAnnotation) {
        return;
      }

      // Check if return type is 'unknown'
      if (returnTypeAnnotation.type === "TSUnknownKeyword") {
        context.report({
          node: returnTypeAnnotation,
          messageId: "unknownReturn",
        });
      }

      // Check for type predicates (v is Type) - these are OK
      if (returnTypeAnnotation.type === "TSTypePredicate") {
        return;
      }
    }

    return {
      // Handle function declarations and function expressions
      "FunctionDeclaration, FunctionExpression, ArrowFunctionExpression"(node) {
        checkFunctionReturnType(node);
      },
      // Handle method definitions
      MethodDefinition(node) {
        if (node.value) {
          checkFunctionReturnType(node.value);
        }
      },
      // Handle object method shorthand
      "Property[method=true]"(node) {
        if (node.value) {
          checkFunctionReturnType(node.value);
        }
      },
    };
  },
};
