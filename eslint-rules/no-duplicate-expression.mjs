// Custom rule: warn when the exact same call expression appears more than once
// within the same function (or top-level module scope). Rationale: repeating
// a call like `b(c(wah))` in two places usually means it should be computed
// once, stored in a local variable, and reused — the same "don't repeat
// yourself" idea as no-single-use-function, just applied to expressions
// instead of whole functions.
//
// This still can't know whether a call has side effects that make deduping
// unsafe (e.g. Math.random()) — that's reported as a suggestion to review,
// not a hard error. But it DOES check whether any variable referenced in the
// expression (e.g. a scan position like `i`) is reassigned between the two
// occurrences, and skips reporting when so: two textually-identical calls to
// `source.substring(i, i + 5)` at different points in a scanning loop are
// not the same value if `i` moved in between, and "extracting" them into one
// shared variable would silently change behavior.

function walk(node, visitorKeys, visit) {
  if (!node || typeof node.type !== "string") return;
  visit(node);
  const keys = visitorKeys[node.type] || [];
  for (const key of keys) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) walk(c, visitorKeys, visit);
    } else if (child) {
      walk(child, visitorKeys, visit);
    }
  }
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow repeating the same call expression within a scope; extract it to a local variable instead.",
    },
    schema: [],
    messages: {
      duplicateExpression:
        "This expression duplicates the one on line {{line}}. Extract it to a local variable instead of recomputing it.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const visitorKeys = sourceCode.visitorKeys;
    // container -> normalizedText -> nodes[]
    const groupsByContainer = new Map();

    return {
      CallExpression(node) {
        let container = node.parent;
        while (
          container &&
          container.type !== "FunctionDeclaration" &&
          container.type !== "FunctionExpression" &&
          container.type !== "ArrowFunctionExpression" &&
          container.type !== "Program"
        ) {
          container = container.parent;
        }
        if (!container) return;

        // No regex literals allowed in this project — strip whitespace by hand.
        let text = "";
        const rawText = sourceCode.getText(node);
        for (let i = 0; i < rawText.length; i++) {
          const ch = rawText[i];
          if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") continue;
          text += ch;
        }
        let groups = groupsByContainer.get(container);
        if (!groups) {
          groups = new Map();
          groupsByContainer.set(container, groups);
        }
        let nodes = groups.get(text);
        if (!nodes) {
          nodes = [];
          groups.set(text, nodes);
        }
        nodes.push(node);
      },

      "Program:exit"() {
        for (const [container, groups] of groupsByContainer) {
          // Every place within `container` that assigns/updates/redeclares a
          // name, keyed by name -> sorted list of positions (source offsets).
          const writesByName = new Map();
          walk(container, visitorKeys, (n) => {
            let name = null;
            if (n.type === "AssignmentExpression" && n.left.type === "Identifier") {
              name = n.left.name;
            } else if (n.type === "UpdateExpression" && n.argument.type === "Identifier") {
              name = n.argument.name;
            } else if (n.type === "VariableDeclarator" && n.id.type === "Identifier" && n.init) {
              name = n.id.name;
            }
            if (name === null) return;
            let positions = writesByName.get(name);
            if (!positions) {
              positions = [];
              writesByName.set(name, positions);
            }
            positions.push(n.range[0]);
          });

          // For each group of textually-identical calls, walk them in source
          // order and only pair up occurrences whose referenced names weren't
          // reassigned since the reference occurrence — otherwise start a
          // fresh chain from the occurrence where the value could have changed.
          const reportPairs = [];
          for (const nodes of groups.values()) {
            if (nodes.length < 2) continue;
            const sorted = [...nodes].sort((a, b) => a.range[0] - b.range[0]);
            let referenceNode = sorted[0];
            for (let idx = 1; idx < sorted.length; idx++) {
              const node = sorted[idx];

              const names = new Set();
              walk(node, visitorKeys, (n) => {
                if (n.type === "Identifier") names.add(n.name);
              });

              let hasWriteBetween = false;
              for (const name of names) {
                const positions = writesByName.get(name);
                if (!positions) continue;
                for (const pos of positions) {
                  if (pos >= referenceNode.range[1] && pos <= node.range[0]) {
                    hasWriteBetween = true;
                    break;
                  }
                }
                if (hasWriteBetween) break;
              }

              if (hasWriteBetween) {
                referenceNode = node;
                continue;
              }
              reportPairs.push({ node, referenceNode });
            }
          }

          const duplicateNodes = new Set();
          for (const { node, referenceNode } of reportPairs) {
            duplicateNodes.add(node);
            duplicateNodes.add(referenceNode);
          }

          for (const { node, referenceNode } of reportPairs) {
            let isNested = false;
            for (let current = node.parent; current && current !== container; current = current.parent) {
              if (duplicateNodes.has(current)) {
                isNested = true;
                break;
              }
            }
            if (isNested) continue;
            context.report({
              node,
              messageId: "duplicateExpression",
              data: { line: referenceNode.loc.start.line },
            });
          }
        }
      },
    };
  },
};
