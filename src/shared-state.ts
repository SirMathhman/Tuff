import type { ScopeValue } from "./types.js";

/** WeakMap to track mutable variable names per scope instance. */
export const MUTABLE_VARS = new WeakMap<Map<string, ScopeValue>, Set<string>>();

export function getMutableSet(scope: Map<string, ScopeValue>): Set<string> {
  let mutSet = MUTABLE_VARS.get(scope);
  if (!mutSet) {
    mutSet = new Set();
    MUTABLE_VARS.set(scope, mutSet);
  }
  return mutSet;
}

/** WeakMap to track type-annotated variable names per scope instance. */
export const TYPE_ANNOTATIONS = new WeakMap<
  Map<string, ScopeValue>,
  Map<string, string>
>();

export function getTypeAnnotations(
  scope: Map<string, ScopeValue>,
): Map<string, string> {
  let annots = TYPE_ANNOTATIONS.get(scope);
  if (!annots) {
    annots = new Map();
    TYPE_ANNOTATIONS.set(scope, annots);
  }
  return annots;
}

/** WeakMap to track pointer variable targets per scope instance. */
export const POINTER_TARGETS = new WeakMap<
  Map<string, ScopeValue>,
  Map<string, string>
>();

export function getPointerTargets(
  scope: Map<string, ScopeValue>,
): Map<string, string> {
  let ptrs = POINTER_TARGETS.get(scope);
  if (!ptrs) {
    ptrs = new Map();
    POINTER_TARGETS.set(scope, ptrs);
  }
  return ptrs;
}

/** WeakMap to track variables with non-zero refinement (e.g., `let x : U8 != 0`). */
export const NON_ZERO_VARS = new WeakMap<
  Map<string, ScopeValue>,
  Set<string>
>();

export function getNonZeroSet(scope: Map<string, ScopeValue>): Set<string> {
  let nzSet = NON_ZERO_VARS.get(scope);
  if (!nzSet) {
    nzSet = new Set();
    NON_ZERO_VARS.set(scope, nzSet);
  }
  return nzSet;
}

/** Split input by semicolons, respecting brace and bracket nesting. */
export function splitStatements(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charAt(i);
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") depth--;
    else if (ch === ";" && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  const last = current.trim();
  if (last.length > 0) parts.push(last);
  return parts.filter(Boolean);
}

/** Check if a brace-enclosed string is an object literal (has key: value pairs). */
export function isObjectLiteral(expr: string): boolean {
  const trimmed = expr.trim();
  return /^\w+\s*:/.test(trimmed) || /^\{[^}]*\s*:\s*/.test(expr);
}
