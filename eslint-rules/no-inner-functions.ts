import { Rule } from 'eslint';

const rule: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow function declarations inside functions',
      category: 'Best Practices',
      recommended: false,
    },
    messages: {
      innerFunction: 'Inner functions are not allowed',
    },
  },
  create(context) {
    return {
      FunctionDeclaration(node) {
        const parent = node.parent;
        // Check if parent is a function (excluding Program and block statements at top level)
        if (
          parent &&
          (parent.type === 'FunctionDeclaration' ||
            parent.type === 'FunctionExpression' ||
            parent.type === 'ArrowFunctionExpression' ||
            (parent.type === 'BlockStatement' &&
              (parent.parent?.type === 'FunctionDeclaration' ||
                parent.parent?.type === 'FunctionExpression' ||
                parent.parent?.type === 'ArrowFunctionExpression')))
        ) {
          context.report({
            node,
            messageId: 'innerFunction',
          });
        }
      },
    };
  },
};

export default rule;
