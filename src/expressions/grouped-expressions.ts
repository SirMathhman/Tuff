import { findMatchingClose } from "../match";
import { parseStructInstantiation } from "../types/structs";
import type { Interpreter } from "./handlers";
import { isValidIdentifier } from "../utils/identifier-utils";
import { executeDropHandlers } from "./drop-handlers";
import {
  shouldSkipLambda,
  shouldSkipArrayIndexing,
  shouldSkipMatchOrStruct,
  extractStructName,
} from "./skip-patterns";

function tryStructInstantiation(
  s: string,
  braceIndex: number,
  typeMap: Map<string, number>,
  scope: Map<string, number>,
  interpreter: Interpreter,
): string | undefined {
  const beforeBrace = s.slice(0, braceIndex).trim();
  const baseStructName = extractStructName(beforeBrace);
  if (
    !beforeBrace ||
    !baseStructName ||
    (!isValidIdentifier(beforeBrace) && !beforeBrace.includes("<")) ||
    !typeMap.has("__struct__" + baseStructName)
  ) {
    return undefined;
  }
  try {
    const structResult = parseStructInstantiation(
      s,
      typeMap,
      scope,
      interpreter,
    );
    if (structResult === undefined) return undefined;
    let braceDepth = 0;
    let closeIndex = -1;
    for (let i = braceIndex; i < s.length; i++) {
      if (s[i] === "{") braceDepth++;
      else if (s[i] === "}") {
        braceDepth--;
        if (braceDepth === 0) {
          closeIndex = i;
          break;
        }
      }
    }
    if (closeIndex === -1) return undefined;
    const after = s.slice(closeIndex + 1);
    return after.trim() ? String(structResult) + after : String(structResult);
  } catch (_e) {
    return undefined;
  }
}

function processGroupedExpression(
  s: string,
  openIndex: number,
  closeIndex: number,
  openChar: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  interpreter: Interpreter,
): string {
  const inside = s.slice(openIndex + 1, closeIndex);
  const cScope = new Map(scope);
  const cTypeMap = new Map(typeMap);
  const cMutMap = new Map(mutMap);
  const cUninitializedSet = new Set<string>();
  const cUnmutUninitializedSet = new Set<string>();
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
    for (const [k, v] of cMutMap.entries()) if (mutMap.has(k)) mutMap.set(k, v);
    executeDropHandlers(cScope, scope, cTypeMap, typeMap, mutMap, interpreter);
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
    return s.slice(0, openIndex) + after;
  }
  return s.slice(0, openIndex) + String(result) + s.slice(closeIndex + 1);
}

function tryProcessGroup(
  s: string,
  pairs: Array<[string, string]>,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  interpreter: Interpreter,
): string | undefined {
  for (const [openChar, closeChar] of pairs) {
    const openIndex = s.indexOf(openChar);
    if (openIndex === -1) continue;
    if (shouldSkipLambda(s, openIndex, openChar, closeChar)) continue;
    if (shouldSkipArrayIndexing(s, openIndex, openChar)) continue;
    if (shouldSkipMatchOrStruct(s, openIndex, openChar, closeChar, typeMap))
      continue;
    const closeIndex = findMatchingClose(s, openIndex, openChar, closeChar);
    if (closeIndex === -1) throw new Error(`unmatched opening ${openChar}`);
    return processGroupedExpression(
      s,
      openIndex,
      closeIndex,
      openChar,
      scope,
      typeMap,
      mutMap,
      interpreter,
    );
  }
  return undefined;
}

function checkAndProcessStruct(
  s: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  interpreter: Interpreter,
): string | undefined {
  const braceIndex = s.indexOf("{");
  if (braceIndex <= 0) return undefined;
  const structResult = tryStructInstantiation(
    s,
    braceIndex,
    typeMap,
    scope,
    interpreter,
  );
  if (!structResult) return undefined;
  return evaluateGroupedExpressionsWithScope(
    structResult,
    scope,
    typeMap,
    mutMap,
    interpreter,
  );
}

export function evaluateGroupedExpressionsWithScope(
  s: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  interpreter: Interpreter,
): string {
  const trimmed = s.trim();
  if (trimmed.startsWith("match") && trimmed.includes("case ")) return s;
  const structResult = checkAndProcessStruct(
    s,
    scope,
    typeMap,
    mutMap,
    interpreter,
  );
  if (structResult) return structResult;
  const pairs: Array<[string, string]> = [
    ["(", ")"],
    ["{", "}"],
    ["[", "]"],
  ];
  const processed = tryProcessGroup(
    s,
    pairs,
    scope,
    typeMap,
    mutMap,
    interpreter,
  );
  if (processed) {
    return evaluateGroupedExpressionsWithScope(
      processed,
      scope,
      typeMap,
      mutMap,
      interpreter,
    );
  }
  return s;
}
