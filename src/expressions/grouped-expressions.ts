import { findMatchingClose } from "../match";
import { parseStructInstantiation } from "../types/structs";
import type { Interpreter } from "./handlers";
import { isValidIdentifier } from "../utils/identifier-utils";
import { parseArrayLiteral } from "../utils/array";
import { executeDropHandlers } from "./drop-handlers";

function extractStructName(s: string): string | undefined {
  const angleEnd = s.indexOf(">");
  const angleStart = s.indexOf("<");
  if (angleStart === -1) return s;
  if (angleEnd === -1) return undefined;
  return s.slice(0, angleStart).trim();
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

  // Check for struct instantiation before processing grouped expressions
  const braceIndex = s.indexOf("{");
  if (braceIndex > 0) {
    const beforeBrace = s.slice(0, braceIndex).trim();
    // Check if this looks like a struct instantiation (word { ... } or word<type> { ... })
    const baseStructName = extractStructName(beforeBrace);
    if (
      beforeBrace &&
      baseStructName &&
      (isValidIdentifier(beforeBrace) || beforeBrace.includes("<")) &&
      typeMap.has("__struct__" + baseStructName)
    ) {
      try {
        const structResult = parseStructInstantiation(
          s,
          typeMap,
          scope,
          interpreter,
        );
        if (structResult !== undefined) {
          // Find where the struct instantiation ends
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

          if (closeIndex !== -1) {
            // Replace the struct instantiation with its result
            const after = s.slice(closeIndex + 1);
            if (after.trim()) {
              // There's something after the struct, continue evaluating
              return evaluateGroupedExpressionsWithScope(
                String(structResult) + after,
                scope,
                typeMap,
                mutMap,
                interpreter,
              );
            } else {
              return String(structResult);
            }
          }
        }
      } catch (_e) {
        // Not a valid struct instantiation, continue
      }
    }
  }

  const pairs: Array<[string, string]> = [
    ["(", ")"],
    ["{", "}"],
    ["[", "]"],
  ];
  for (const [openChar, closeChar] of pairs) {
    const openIndex = s.indexOf(openChar);
    if (openIndex === -1) continue;

    // Skip if this is a lambda expression
    if (openChar === "(") {
      const closeIdx = findMatchingClose(s, openIndex, openChar, closeChar);
      if (closeIdx !== -1 && closeIdx + 2 < s.length) {
        const afterParen = s.slice(closeIdx + 1).trim();
        if (afterParen.startsWith("=>")) {
          // This is a lambda expression, skip it
          continue;
        }
      }
    }

    // For brackets, skip if this looks like array indexing (preceded by identifier/)/]/]/quote)
    if (openChar === "[") {
      if (openIndex > 0) {
        const beforeBracket = s[openIndex - 1];
        if (beforeBracket) {
          if (
            (beforeBracket >= "a" && beforeBracket <= "z") ||
            (beforeBracket >= "A" && beforeBracket <= "Z") ||
            (beforeBracket >= "0" && beforeBracket <= "9") ||
            beforeBracket === "_" ||
            beforeBracket === ")" ||
            beforeBracket === "]" ||
            beforeBracket === '"' ||
            beforeBracket === "'"
          ) {
            // This looks like array indexing, skip it
            continue;
          }
        }
      }
      // Also skip if this looks like an array literal (all numeric values)
      const closeIdx = findMatchingClose(s, openIndex, openChar, "]");
      if (closeIdx !== -1) {
        const inside = s.slice(openIndex + 1, closeIdx);
        // Check if it's an array literal by trying to parse it as numbers
        if (inside === "" || parseArrayLiteral("[" + inside + "]")) {
          // This is an array literal, skip it - it will be handled in scope.ts
          continue;
        }
      }
    }

    // For braces, skip if part of a match expression (contains "case" keyword)
    if (openChar === "{") {
      const closeIdx = findMatchingClose(s, openIndex, openChar, closeChar);
      if (closeIdx > 0) {
        const inside = s.slice(openIndex + 1, closeIdx);
        if (inside.includes("case ")) {
          // This is likely a match expression, skip it
          continue;
        }
        // Skip if this looks like a struct instantiation
        if (openIndex > 0) {
          const beforeBrace = s.slice(0, openIndex).trim();
          if (
            beforeBrace &&
            isValidIdentifier(beforeBrace) &&
            typeMap.has("__struct__" + beforeBrace)
          ) {
            continue;
          }
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

      // Execute drop handlers for variables going out of scope
      executeDropHandlers(
        cScope,
        scope,
        cTypeMap,
        typeMap,
        mutMap,
        interpreter,
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
