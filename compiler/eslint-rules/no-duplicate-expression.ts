import type { Rule } from "eslint";
import type { Node as ESTreeNode } from "estree";

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow duplicate sub-expressions — extract the repeated expression into a shared variable instead.",
    },
    schema: [],
    messages: {
      duplicateExpression:
        "This expression is duplicated. Extract it into a shared variable.",
    },
  },
  create(context) {
    // Map from normalised text -> list of ESTree nodes with that text.
    const seen = new Map<string, ESTreeNode[]>();

    function record(node: ESTreeNode): void {
      // Skip single-node expressions — no structural duplication signal.
      if (
        node.type === "Identifier" ||
        node.type === "Literal" ||
        node.type === "ThisExpression" ||
        node.type === "Super"
      ) {
        return;
      }
      // Require at least 4 tokens so that shallow expressions like `a.length`
      // or `i < n` (each 3 tokens) are not flagged.
      if (context.sourceCode.getTokens(node).length < 4) return;
      // Collapse whitespace runs so formatting differences don't prevent
      // structurally identical nodes from matching.
      const raw = context.sourceCode.getText(node);
      let key = "";
      let inSpace = false;
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
          if (!inSpace) {
            key += " ";
            inSpace = true;
          }
        } else {
          key += ch;
          inSpace = false;
        }
      }
      key = key.trim();
      const bucket = seen.get(key);
      if (bucket === undefined) {
        seen.set(key, [node]);
      } else {
        bucket.push(node);
      }
    }

    return {
      // Visit every expression category that can be meaningfully duplicated.
      BinaryExpression: record,
      LogicalExpression: record,
      UnaryExpression: record,
      CallExpression: record,
      MemberExpression: record,
      ConditionalExpression: record,
      AssignmentExpression: record,
      SequenceExpression: record,
      ArrayExpression: record,
      ObjectExpression: record,
      NewExpression: record,

      "Program:exit"() {
        // Collect all keys (normalised texts) that appear 2+ times.
        const duplicateKeys = new Set<string>();
        for (const [key, nodes] of seen) {
          if (nodes.length >= 2) {
            duplicateKeys.add(key);
          }
        }

        // For each group, suppress nodes that are strict sub-expressions of
        // another node in the *same* group — report only the largest repeated
        // subtree, not every sub-part of it (which would be noisy).
        for (const [key, nodes] of seen) {
          if (!duplicateKeys.has(key)) continue;

          // Build {start, end} pairs for each node in this group.
          // Nodes without range info get the zero sentinel as a fallback.
          type Range = { start: number; end: number };
          const zeroRange: Range = { start: 0, end: 0 };
          const ranges: Range[] = nodes.map((n) => {
            const r = n.range;
            if (r === undefined) return zeroRange;
            const [rStart, rEnd] = r;
            return { start: rStart, end: rEnd };
          });

          for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            // nodes[i] is always defined since we iterate within bounds,
            // but noUncheckedIndexedAccess requires a guard.
            if (node === undefined) continue;
            const { start: nodeStart, end: nodeEnd } = ranges[i] ?? zeroRange;

            // Check whether any *other* node in the same group strictly
            // contains this one — if so, skip (the parent will be reported).
            let suppressed = false;
            for (let j = 0; j < ranges.length; j++) {
              if (j === i) continue;
              const { start: mStart, end: mEnd } = ranges[j] ?? zeroRange;
              if (mStart <= nodeStart && nodeEnd <= mEnd) {
                suppressed = true;
                break;
              }
            }
            if (suppressed) continue;

            // Also suppress if a *different*, larger duplicate key's nodes
            // strictly contain this node — avoids double-reporting when both
            // a sub-expression and its parent are duplicated independently.
            for (const [otherKey, otherNodes] of seen) {
              if (suppressed) break;
              if (otherKey === key) continue;
              if (!duplicateKeys.has(otherKey)) continue;
              for (const otherNode of otherNodes) {
                const r = otherNode.range;
                if (r === undefined) continue;
                const [oStart, oEnd] = r;
                if (oStart <= nodeStart && nodeEnd <= oEnd) {
                  suppressed = true;
                  break;
                }
              }
            }
            if (suppressed) continue;

            context.report({
              node,
              messageId: "duplicateExpression",
            });
          }
        }
      },
    };
  },
} satisfies Rule.RuleModule;
