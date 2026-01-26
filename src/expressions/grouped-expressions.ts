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

type GroupedEvalContext = {
  scope: Map<string, number>;
  typeMap: Map<string, number>;
  mutMap: Map<string, boolean>;
  interpreter: Interpreter;
};

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

function processGroupedExpression(p: {
  s: string;
  openIndex: number;
  closeIndex: number;
  openChar: string;
  ctx: GroupedEvalContext;
}): string {
  const { s, openIndex, closeIndex, openChar, ctx } = p;
  const inside = s.slice(openIndex + 1, closeIndex);
  const cScope = new Map(ctx.scope);
  const cTypeMap = new Map(ctx.typeMap);
  const cMutMap = new Map(ctx.mutMap);
  const cUninitializedSet = new Set<string>();
  const cUnmutUninitializedSet = new Set<string>();
  const result = ctx.interpreter(
    inside,
    cScope,
    cTypeMap,
    cMutMap,
    cUninitializedSet,
    cUnmutUninitializedSet,
  );
  if (openChar === "{") {
    for (const [k, v] of cScope.entries())
      if (ctx.scope.has(k)) ctx.scope.set(k, v);
    for (const [k, v] of cMutMap.entries())
      if (ctx.mutMap.has(k)) ctx.mutMap.set(k, v);
    executeDropHandlers(
      cScope,
      ctx.scope,
      cTypeMap,
      ctx.typeMap,
      ctx.mutMap,
      ctx.interpreter,
    );
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
  ctx: GroupedEvalContext,
): string | undefined {
  for (const [openChar, closeChar] of pairs) {
    const openIndex = s.indexOf(openChar);
    if (openIndex === -1) continue;
    if (shouldSkipLambda(s, openIndex, openChar, closeChar)) continue;
    if (shouldSkipArrayIndexing(s, openIndex, openChar)) continue;
    if (shouldSkipMatchOrStruct(s, openIndex, openChar, closeChar, ctx.typeMap))
      continue;
    const closeIndex = findMatchingClose(s, openIndex, openChar, closeChar);
    if (closeIndex === -1) throw new Error(`unmatched opening ${openChar}`);
    return processGroupedExpression({
      s,
      openIndex,
      closeIndex,
      openChar,
      ctx,
    });
  }
  return undefined;
}

function checkAndProcessStruct(
  s: string,
  ctx: GroupedEvalContext,
): string | undefined {
  const braceIndex = s.indexOf("{");
  if (braceIndex <= 0) return undefined;
  const structResult = tryStructInstantiation(
    s,
    braceIndex,
    ctx.typeMap,
    ctx.scope,
    ctx.interpreter,
  );
  if (!structResult) return undefined;
  return evaluateGroupedExpressionsWithScope({
    s: structResult,
    scope: ctx.scope,
    typeMap: ctx.typeMap,
    mutMap: ctx.mutMap,
    interpreter: ctx.interpreter,
  });
}

export function evaluateGroupedExpressionsWithScope(
  p: { s: string } & GroupedEvalContext,
): string {
  const ctx: GroupedEvalContext = {
    scope: p.scope,
    typeMap: p.typeMap,
    mutMap: p.mutMap,
    interpreter: p.interpreter,
  };
  const trimmed = p.s.trim();
  if (trimmed.startsWith("match") && trimmed.includes("case ")) return p.s;
  const structResult = checkAndProcessStruct(p.s, ctx);
  if (structResult) return structResult;
  const pairs: Array<[string, string]> = [
    ["(", ")"],
    ["{", "}"],
    ["[", "]"],
  ];
  const processed = tryProcessGroup(p.s, pairs, ctx);
  if (processed) {
    return evaluateGroupedExpressionsWithScope({
      s: processed,
      scope: p.scope,
      typeMap: p.typeMap,
      mutMap: p.mutMap,
      interpreter: p.interpreter,
    });
  }
  return p.s;
}
