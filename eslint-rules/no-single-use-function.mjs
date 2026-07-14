// Custom rule: warn when a named function is referenced from exactly one call site.
// Rationale: a function used twice+ is legitimate reuse, and a function used zero
// times is dead code (caught elsewhere, e.g. no-unused-vars). A function used
// exactly once is neither — it should be inlined at its single call site instead
// of existing as a separate function.

function checkDeclaration(context, node, nameNode) {
  let isExported = false;
  for (let current = node; current && current.type !== "Program"; current = current.parent) {
    if (
      current.type === "ExportNamedDeclaration" ||
      current.type === "ExportDefaultDeclaration"
    ) {
      isExported = true;
      break;
    }
  }
  if (isExported) return;

  const sourceCode = context.sourceCode ?? context.getSourceCode();
  const [variable] = sourceCode.getDeclaredVariables(node);
  if (!variable) return;

  const [start, end] = node.range;
  let external = 0;
  let hasSelfReference = false;
  for (const ref of variable.references) {
    const idRange = ref.identifier.range;
    // A reference inside the declaration's own range is a recursive self-call,
    // not a use "elsewhere" — and it also means the function can't just be
    // inlined at its one external call site (it needs a name to recurse).
    if (idRange[0] >= start && idRange[1] <= end) {
      hasSelfReference = true;
    } else {
      external++;
    }
  }
  if (hasSelfReference) return; // recursive functions aren't trivially inlinable

  if (external === 1) {
    context.report({
      node: nameNode,
      messageId: "singleUse",
      data: { name: nameNode.name },
    });
  }
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow functions referenced from exactly one call site; inline them instead.",
    },
    schema: [],
    messages: {
      singleUse:
        "Function '{{name}}' is used only once. Inline it at its call site instead of keeping it as a separate function.",
    },
  },
  create(context) {
    return {
      FunctionDeclaration(node) {
        if (!node.id) return;
        checkDeclaration(context, node, node.id);
      },
      VariableDeclarator(node) {
        if (
          node.id.type !== "Identifier" ||
          !node.init ||
          (node.init.type !== "FunctionExpression" &&
            node.init.type !== "ArrowFunctionExpression")
        ) {
          return;
        }
        checkDeclaration(context, node, node.id);
      },
    };
  },
};
