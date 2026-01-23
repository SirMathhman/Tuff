import { extractValueExpression } from "./loop-common";

export function findIfBreak(stmt: string): {
  hasIf: boolean;
  condition: string;
  breakValue: string;
} {
  const ifIdx = stmt.indexOf("if");
  if (ifIdx === -1) return { hasIf: false, condition: "", breakValue: "" };

  const afterIf = stmt.substring(ifIdx + 2).trim();
  if (!afterIf.startsWith("(")) {
    return { hasIf: false, condition: "", breakValue: "" };
  }

  let depth = 0,
    condEnd = -1;
  for (let i = 0; i < afterIf.length; i = i + 1) {
    const ch = afterIf.charAt(i);
    if (ch === "(") depth = depth + 1;
    if (ch === ")") {
      depth = depth - 1;
      if (depth === 0) {
        condEnd = i;
        break;
      }
    }
  }

  if (condEnd === -1) {
    return { hasIf: false, condition: "", breakValue: "" };
  }

  const condition = afterIf.substring(1, condEnd),
    afterCond = afterIf.substring(condEnd + 1).trim();

  if (!afterCond.startsWith("break")) {
    return { hasIf: false, condition: "", breakValue: "" };
  }

  const afterBreak = afterCond.substring(5).trim();
  const valueExpr = extractValueExpression(afterBreak);

  return {
    hasIf: true,
    condition: condition.trim(),
    breakValue: valueExpr,
  };
}
