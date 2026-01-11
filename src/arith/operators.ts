export interface OpParseResult {
  op: string;
  nextPos: number;
}

export function parseComparisonOp(
  s: string,
  pos: number
): OpParseResult | undefined {
  const n = s.length;
  const ch = s[pos];
  if (ch === "<") {
    if (pos + 1 < n && s[pos + 1] === "=")
      return { op: "<=", nextPos: pos + 2 };
    return { op: "<", nextPos: pos + 1 };
  }
  if (ch === ">") {
    if (pos + 1 < n && s[pos + 1] === "=")
      return { op: ">=", nextPos: pos + 2 };
    return { op: ">", nextPos: pos + 1 };
  }
  if (ch === "=") {
    if (pos + 1 < n && s[pos + 1] === "=")
      return { op: "==", nextPos: pos + 2 };
    return undefined;
  }
  if (ch === "!") {
    if (pos + 1 < n && s[pos + 1] === "=")
      return { op: "!=", nextPos: pos + 2 };
    return undefined;
  }
  return undefined;
}

export function applyComparisonOp(op: string, a: number, b: number): number {
  switch (op) {
    case "<":
      return a < b ? 1 : 0;
    case ">":
      return a > b ? 1 : 0;
    case "<=":
      return a <= b ? 1 : 0;
    case ">=":
      return a >= b ? 1 : 0;
    case "==":
      return a === b ? 1 : 0;
    case "!=":
      return a !== b ? 1 : 0;
    default:
      return 0;
  }
}
