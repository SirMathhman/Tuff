import type { Result, Err } from "./result";
import { findMatchingParenIndex, isIdentifierOnly } from "./interpretHelpers";

interface Binding {
  value: number;
  suffix?: string;
  // matches Binding shape in interpret.ts: track initialization/assignment state
  assigned?: boolean;
  mutable?: boolean;
}

interface EnvWithParent {
  __parent?: Map<string, Binding>;
}

export function lookupBinding(
  name: string,
  env: Map<string, Binding>,
  fallbackEnv?: Map<string, Binding>
): Result<Binding, string> {
  // Traverse the env and its parent chain (if attached) first
  let cur: Map<string, Binding> | undefined = env;
  while (cur) {
    const binding = cur.get(name);
    if (binding) return { ok: true, value: binding };
    const parent = (cur as unknown as EnvWithParent).__parent;
    cur = parent;
  }
  // If provided, also search the fallback env chain
  if (fallbackEnv) return lookupBinding(name, fallbackEnv);
  return { ok: false, error: `unknown identifier ${name}` };
}

export function findBindingEnv(
  name: string,
  env: Map<string, Binding>,
  fallbackEnv?: Map<string, Binding>
): Map<string, Binding> | undefined {
  let cur: Map<string, Binding> | undefined = env;
  while (cur) {
    if (cur.has(name)) return cur;
    const parent = (cur as unknown as EnvWithParent).__parent;
    cur = parent;
  }
  if (fallbackEnv) return findBindingEnv(name, fallbackEnv);
  return undefined;
}

interface SingleIfValidateResult {
  err?: Err<string>;
  nextPos?: number;
}

export function validateSingleIfAtIndex(
  rhs: string,
  i: number,
  env: Map<string, Binding>
): SingleIfValidateResult {
  let j = i + 2;
  while (j < rhs.length && rhs[j] === " ") j++;
  if (j >= rhs.length || rhs[j] !== "(")
    return { err: { ok: false, error: "invalid conditional expression" } };
  const k = findMatchingParenIndex(rhs, j);
  if (k === -1) return { err: { ok: false, error: "unmatched parenthesis" } };
  const condText = rhs.slice(j + 1, k).trim();
  if (
    isIdentifierOnly(condText) &&
    condText !== "true" &&
    condText !== "false"
  ) {
    const name = condText.split(" ")[0];
    const b = lookupBinding(name, env);
    if (!b.ok) return { err: { ok: false, error: b.error } };
    if (!(b.value.value === 0 || b.value.value === 1))
      return { err: { ok: false, error: "invalid conditional expression" } };
  }
  return { nextPos: k + 1 };
}

export function validateIfIdentifierConditions(
  rhs: string,
  env: Map<string, Binding>
): Err<string> | undefined {
  if (rhs.indexOf("if(") === -1 && rhs.indexOf("if (") === -1) return undefined;
  let i = 0;
  let depth = 0;
  while (i < rhs.length) {
    const ch = rhs[i];
    if (ch === "(" || ch === "{" || ch === "[") {
      depth++;
      i++;
      continue;
    }
    if (ch === ")" || ch === "}" || ch === "]") {
      depth--;
      i++;
      continue;
    }
    if (
      depth === 0 &&
      rhs.startsWith("if", i) &&
      (rhs[i + 2] === " " || rhs[i + 2] === "(")
    ) {
      const res = validateSingleIfAtIndex(rhs, i, env);
      if (res.err) return res.err;
      i = res.nextPos!;
      continue;
    }
    i++;
  }
  return undefined;
}
