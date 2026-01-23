import { findMatchingClose } from "../match";
import type { Interpreter } from "./handlers";

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
      cMutMap = new Map(mutMap),
      cUninitializedSet = new Set<string>(),
      cUnmutUninitializedSet = new Set<string>();
    const result = interpreter(
      inside,
      cScope,
      cTypeMap,
      cMutMap,
      cUninitializedSet,
      cUnmutUninitializedSet,
    );
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
