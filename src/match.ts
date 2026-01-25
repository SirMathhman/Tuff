type Interpreter = (
  input: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
) => number;

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
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  interpreter: Interpreter,
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
  const matchValue = interpreter(
    afterMatch.slice(1, parenCloseIdx),
    scope,
    typeMap,
    mutMap,
  );
  return { matchValue, restStartIdx: parenCloseIdx + 1 };
}

function processCaseMatch(
  matchValue: number,
  caseStr: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  interpreter: Interpreter,
): number | undefined {
  if (!caseStr || !caseStr.startsWith("case ")) return undefined;
  const arrowIdx = caseStr.indexOf("=>");
  if (arrowIdx === -1) return undefined;
  const pattern = caseStr.slice(5, arrowIdx).trim(),
    result = caseStr.slice(arrowIdx + 2).trim();
  if (pattern === "_" || Number(pattern) === matchValue) {
    return interpreter(result, scope, typeMap, mutMap);
  }
  return undefined;
}

export function handleMatch(
  s: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  interpreter: Interpreter,
): number | undefined {
  const trimmed = s.trim();
  if (!trimmed.startsWith("match")) return undefined;
  const parsed = parseMatchValue(trimmed, scope, typeMap, mutMap, interpreter);
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
    const caseResult = processCaseMatch(
      matchValue,
      caseStr,
      scope,
      typeMap,
      mutMap,
      interpreter,
    );
    if (caseResult !== undefined) {
      const matchExprEnd = trimmed.indexOf("{") + 1 + braceCloseIdx + 1;
      const afterMatchExpr = trimmed.slice(matchExprEnd).trim();
      if (afterMatchExpr) {
        return interpreter(afterMatchExpr, scope, typeMap, mutMap);
      }
      return caseResult;
    }
  }
  return 0;
}
