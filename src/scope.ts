import { extractTypedInfo } from "./parser";
import { extractTypeSize } from "./types";
import { findMatchingClose } from "./match";

type Interpreter = (
  input: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
) => number;

export function handleVarDecl(
  s: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  interpreter: Interpreter,
): number | undefined {
  if (s.indexOf("let ") !== 0) return undefined;
  let semiIndex = -1;
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth--;
    else if (ch === "{") braceDepth++;
    else if (ch === "}") braceDepth--;
    else if (ch === "[") bracketDepth++;
    else if (ch === "]") bracketDepth--;
    else if (
      ch === ";" &&
      braceDepth === 0 &&
      parenDepth === 0 &&
      bracketDepth === 0
    ) {
      semiIndex = i;
      break;
    }
  }

  // If no semicolon found, check if this might be a declaration with a match or loop expression
  // In that case, look for where the expression ends
  let declStr: string;
  let restIndex: number;

  if (semiIndex === -1) {
    // Look for "match" or "loop" keyword in the assignment value
    const eqIndex = s.indexOf("=");
    if (eqIndex === -1) return undefined;

    const afterEq = s.slice(eqIndex + 1).trim();
    const trimLenDiff = s.slice(eqIndex + 1).length - afterEq.length;

    if (afterEq.startsWith("match") || afterEq.startsWith("loop")) {
      // Find where the expression ends (closing brace at depth 0)
      let exprBraceDepth = 0;
      let exprParenDepth = 0;
      let exprBraceCloseIdx = -1;

      for (let i = 0; i < afterEq.length; i++) {
        const ch = afterEq[i];
        if (ch === "(") exprParenDepth++;
        else if (ch === ")") exprParenDepth--;
        else if (ch === "{") exprBraceDepth++;
        else if (ch === "}") {
          exprBraceDepth--;
          if (exprBraceDepth === 0 && exprParenDepth === 0) {
            exprBraceCloseIdx = i;
            break;
          }
        }
      }

      if (exprBraceCloseIdx !== -1) {
        // The declaration ends where the expression ends
        // restIndex points to right after the closing brace
        restIndex = eqIndex + 1 + trimLenDiff + exprBraceCloseIdx + 1;
        declStr = s.slice(0, restIndex);
      } else {
        return undefined;
      }
    } else {
      return undefined;
    }
  } else {
    declStr = s.slice(0, semiIndex);
    restIndex = semiIndex + 1;
  }

  const isMut = declStr.indexOf("mut ") !== -1;
  const eqIndex = declStr.indexOf("=");
  if (eqIndex === -1) return undefined;

  const varPart = declStr.slice(4 + (isMut ? 4 : 0), eqIndex).trim(),
    colonIndex = varPart.indexOf(":");
  const varName =
    colonIndex !== -1 ? varPart.slice(0, colonIndex).trim() : varPart;
  if (scope.has(varName))
    throw new Error(`variable '${varName}' already declared`);

  const exprStr = declStr.slice(eqIndex + 1).trim(),
    varValue = interpreter(exprStr, scope, typeMap, mutMap);
  const vType =
    extractTypedInfo(exprStr).typeSize ||
    (scope.has(exprStr) ? typeMap.get(exprStr) || 0 : 0);
  if (colonIndex !== -1 && vType > 0) {
    const dType = extractTypeSize(varPart.slice(colonIndex + 1).trim());
    if (dType > 0 && vType > dType)
      throw new Error(`bad type: ${vType} to U${dType}`);
  }
  scope.set(varName, varValue);
  if (vType > 0) typeMap.set(varName, vType);
  if (isMut) mutMap.set(varName, true);

  const rest = s.slice(restIndex).trim();
  if (rest) {
    return interpreter(rest, scope, typeMap, mutMap);
  }
  return varValue;
}

export function evaluateGroupedExpressionsWithScope(
  s: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  interpreter: Interpreter,
): string {
  // Skip if this appears to be a match expression
  const trimmed = s.trim();
  if (trimmed.startsWith("match") && trimmed.includes("case ")) {
    return s;
  }
  const pairs: Array<[string, string]> = [
    ["(", ")"],
    ["{", "}"],
    ["[", "]"],
  ];
  for (const [openChar, closeChar] of pairs) {
    const openIndex = s.indexOf(openChar);
    if (openIndex === -1) continue;
    // For braces, skip if part of a match expression (contains "case" keyword)
    if (openChar === "{") {
      const closeIdx = findMatchingClose(s, openIndex, openChar, closeChar);
      if (closeIdx > 0) {
        const inside = s.slice(openIndex + 1, closeIdx);
        if (inside.includes("case ")) {
          // This is likely a match expression, skip it
          continue;
        }
      }
    }
    const closeIndex = findMatchingClose(s, openIndex, openChar, closeChar);
    if (closeIndex === -1) throw new Error(`unmatched opening ${openChar}`);
    const inside = s.slice(openIndex + 1, closeIndex);
    const cScope = new Map(scope),
      cTypeMap = new Map(typeMap),
      cMutMap = new Map(mutMap);
    const result = interpreter(inside, cScope, cTypeMap, cMutMap);
    if (openChar === "{") {
      for (const [k, v] of cScope.entries()) if (scope.has(k)) scope.set(k, v);
      for (const [k, v] of cMutMap.entries())
        if (mutMap.has(k)) mutMap.set(k, v);
    }
    const after = s.slice(closeIndex + 1).trim();
    if (
      openChar === "{" &&
      inside.includes("=") &&
      after &&
      !after.includes("+") &&
      !after.includes("-") &&
      !after.includes("*") &&
      !after.includes("/")
    ) {
      return evaluateGroupedExpressionsWithScope(
        s.slice(0, openIndex) + after,
        scope,
        typeMap,
        mutMap,
        interpreter,
      );
    }
    return evaluateGroupedExpressionsWithScope(
      s.slice(0, openIndex) + String(result) + s.slice(closeIndex + 1),
      scope,
      typeMap,
      mutMap,
      interpreter,
    );
  }
  return s;
}
