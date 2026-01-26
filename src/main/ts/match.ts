import { callInterpreter, type ScopeContext } from "./types/interpreter";

export function findMatchingClose(
  s: string,
  openIndex: number,
  openChar: string,
  closeChar: string,
): number {
  let depth = 0;
  for (let i = openIndex; i < s.length; i++) {
    const ch = s[i];
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function parseMatchValue(
  trimmed: string,
  ctx: ScopeContext,
): { matchValue: number; restStartIdx: number } | undefined {
  const afterMatch = trimmed.slice(5).trimStart();
  if (!afterMatch.startsWith("(")) return undefined;
  let parenDepth = 1;
  let parenCloseIdx = -1;
  for (let i = 1; i < afterMatch.length; i++) {
    const ch = afterMatch[i];
    if (ch === "(") parenDepth++;
    else if (ch === ")") {
      parenDepth--;
      if (parenDepth === 0) {
        parenCloseIdx = i;
        break;
      }
    }
  }
  if (parenCloseIdx === -1) return undefined;
  const matchValue = callInterpreter(ctx, afterMatch.slice(1, parenCloseIdx));
  return { matchValue, restStartIdx: parenCloseIdx + 1 };
}

function processCaseMatch(p: {
  matchValue: number;
  caseStr: string;
  ctx: ScopeContext;
}): number | undefined {
  if (!p.caseStr || !p.caseStr.startsWith("case ")) return undefined;
  const arrowIdx = p.caseStr.indexOf("=>");
  if (arrowIdx === -1) return undefined;
  const pattern = p.caseStr.slice(5, arrowIdx).trim(),
    result = p.caseStr.slice(arrowIdx + 2).trim();
  if (pattern === "_" || Number(pattern) === p.matchValue) {
    return callInterpreter(p.ctx, result);
  }
  return undefined;
}

export function handleMatch(
  p: { s: string } & ScopeContext,
): number | undefined {
  const trimmed = p.s.trim();
  if (!trimmed.startsWith("match")) return undefined;
  const parsed = parseMatchValue(trimmed, p);
  if (!parsed) return undefined;
  const { matchValue, restStartIdx } = parsed;
  const afterMatch = trimmed.slice(5).trimStart();
  const restStr = afterMatch.slice(restStartIdx).trim();
  if (!restStr || restStr[0] !== "{") return undefined;
  const braceCloseIdx = findMatchingClose(restStr, 0, "{", "}");
  if (braceCloseIdx === -1) return undefined;
  const caseBody = restStr.slice(1, braceCloseIdx).trim();
  const cases = caseBody.split(";").map((c) => c.trim());
  for (const caseStr of cases) {
    const caseResult = processCaseMatch({
      matchValue,
      caseStr,
      ctx: p,
    });
    if (caseResult !== undefined) {
      const matchExprEnd = trimmed.indexOf("{") + 1 + braceCloseIdx + 1;
      const afterMatchExpr = trimmed.slice(matchExprEnd).trim();
      if (afterMatchExpr) {
        return callInterpreter(p, afterMatchExpr);
      }
      return caseResult;
    }
  }
  return 0;
}
