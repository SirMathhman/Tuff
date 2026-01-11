import type { Result } from "../helpers/result";
import type { Binding } from "../helpers/types";
import {
  parseLeadingNumber,
  deriveAnnotationSuffixForNoInit,
  substituteAllIdents,
  isIdentifierName,
} from "./interpretHelpers";
import {
  validateIfIdentifierConditions,
  lookupBinding,
} from "../control/ifValidators";
import { finalizeInitializedDeclaration } from "../helpers/declarations";
import { interpret } from "../core/interpret";
import { parseFnExpressionAt } from "./fnDeclHelpers";

export function parseBracedInitializer(
  t: string,
  env: Map<string, Binding>,
  evaluateBlockFn: (
    s: string,
    parentEnv?: Map<string, Binding>
  ) => Result<number, string>
): Result<Binding, string> {
  // find matching top-level closing brace
  let depth = 0;
  let i = 0;
  while (i < t.length) {
    if (t[i] === "{") depth++;
    else if (t[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
    i++;
  }
  if (i >= t.length || t[i] !== "}")
    return { ok: false, error: "unmatched brace in initializer" };
  // only allow pure braced block (no trailing tokens)
  const rest = t.slice(i + 1).trim();
  if (rest.length !== 0)
    return { ok: false, error: "unexpected tokens after braced initializer" };

  const inner = t.slice(1, i);
  const innerRes = evaluateBlockFn(inner, env);
  if (!innerRes.ok) return innerRes as Result<Binding, string>;
  const binding: Binding = { value: innerRes.value };
  return { ok: true, value: binding };
}

function tryResolveBoolLiteral(t: string): Binding | undefined {
  if (t === "true") return { value: 1 };
  if (t === "false") return { value: 0 };
  return undefined;
}

function isIdentLikeToken(s: string): boolean {
  if (s.length === 0) return false;
  for (let i = 0; i < s.length; i++) {
    const cc = s.charCodeAt(i);
    const ok =
      (cc >= 65 && cc <= 90) ||
      (cc >= 97 && cc <= 122) ||
      (cc >= 48 && cc <= 57) ||
      cc === 95;
    if (!ok) return false;
  }
  return true;
}

function extractSuffixFromSubstituted(substituted: string): string | undefined {
  const parsedNum = parseLeadingNumber(substituted);
  if (!parsedNum || parsedNum.end >= substituted.length) return undefined;

  const rest = substituted.slice(parsedNum.end).trim();
  if (!isIdentLikeToken(rest)) return undefined;
  return rest;
}

function resolveExpressionInitializer(
  rhs: string,
  env: Map<string, Binding>
): Result<Binding, string> {
  const err = validateIfIdentifierConditions(rhs, env);
  if (err) return err;

  const subAll = substituteAllIdents(rhs, env);
  if (!subAll.ok) return { ok: false, error: subAll.error };

  const r = interpret(subAll.value, env);
  if (!r.ok) return { ok: false, error: r.error };

  const suffix = extractSuffixFromSubstituted(subAll.value);
  return { ok: true, value: { value: r.value, suffix } };
}

export function resolveInitializer(
  rhs: string,
  env: Map<string, Binding>,
  evaluateBlockFn: (
    s: string,
    parentEnv?: Map<string, Binding>
  ) => Result<number, string>
): Result<Binding, string> {
  const t = rhs.trim();

  const bool = tryResolveBoolLiteral(t);
  if (bool) return { ok: true, value: bool };

  // function expression initializer (e.g., fn name() => body or fn () => body)
  if (t.startsWith("fn ")) {
    const fnRes = parseFnExpressionAt(t, 0);
    if (fnRes && fnRes.ok) {
      const fnExpr = fnRes.value;
      const binding: Binding = {
        value: 0,
        assigned: true,
        fn: {
          params: fnExpr.params,
          body: fnExpr.body,
          closure: env,
        },
      };
      return { ok: true, value: binding };
    }
    if (fnRes && !fnRes.ok) return fnRes;
  }

  // identifier initializer
  if (isIdentifierName(t)) {
    const name = t.split(" ")[0];
    return lookupBinding(name, env);
  }

  if (t.startsWith("{")) {
    const brRes = parseBracedInitializer(t, env, evaluateBlockFn);
    if (!brRes.ok) return brRes as Result<Binding, string>;
    return brRes;
  }

  return resolveExpressionInitializer(rhs, env);
}

function scanIdentFrom(stmt: string, start: number) {
  let idx = start;
  while (idx < stmt.length) {
    const c = stmt.charCodeAt(idx);
    if (
      (c >= 65 && c <= 90) ||
      (c >= 97 && c <= 122) ||
      (c >= 48 && c <= 57) ||
      c === 95
    )
      idx++;
    else break;
  }
  const ident = stmt.slice(start, idx);
  return ident ? { ident, nextPos: idx } : undefined;
}

export function parseDeclaration(
  stmt: string,
  env: Map<string, Binding>,
  evaluateBlockFn: (
    s: string,
    parentEnv?: Map<string, Binding>
  ) => Result<number, string>
): Result<void, string> {
  let p = 4;
  while (p < stmt.length && stmt[p] === " ") p++;

  // optional 'mut' keyword
  let isMutable = false;
  if (stmt.startsWith("mut", p)) {
    const post = p + 3;
    if (post >= stmt.length || stmt[post] === " ") {
      isMutable = true;
      p = post;
      while (p < stmt.length && stmt[p] === " ") p++;
    }
  }

  const start = p;

  const scan = scanIdentFrom(stmt, start);
  if (!scan) return { ok: false, error: "invalid declaration" };
  const ident = scan.ident;
  p = scan.nextPos;

  const eq = stmt.indexOf("=", p);
  // no initializer: allow annotation-only declarations like 'let x : I32'
  if (eq === -1) {
    const colonPos = stmt.indexOf(":", p);
    // deriveAnnotationSuffixForNoInit placed in interpretHelpers
    const maybeSuffix = deriveAnnotationSuffixForNoInit(stmt, colonPos);
    if (!maybeSuffix.ok) return maybeSuffix as Result<void, string>;
    const suffix = maybeSuffix.value;

    if (env.has(ident)) return { ok: false, error: "duplicate declaration" };
    // uninitialized binding: assigned = false (first assignment allowed). store mutability
    env.set(ident, { value: 0, suffix, assigned: false, mutable: isMutable });
    return { ok: true, value: undefined };
  }

  const rhs = stmt.slice(eq + 1).trim();

  const init = resolveInitializer(rhs, env, evaluateBlockFn);
  if (!init.ok) return init as Result<void, string>;

  return finalizeInitializedDeclaration(
    stmt,
    ident,
    p,
    eq,
    rhs,
    init.value,
    env,
    isMutable
  );
}
