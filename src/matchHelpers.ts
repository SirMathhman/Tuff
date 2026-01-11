import type { Result, Err } from "./result";
import { parseLeadingNumber, BindingLike } from "./interpretHelpers";

interface MatchArm {
  isWildcard: boolean;
  pat?: number;
  expr: string;
}

export function findMatchingBraceIndex(s: string, start: number): number {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function parseMatchArms(inner: string): Result<MatchArm[], string> {
  let p = 0;
  const arms: MatchArm[] = [];
  while (p < inner.length) {
    while (p < inner.length && inner[p] === " ") p++;
    if (p >= inner.length) break;
    if (!inner.slice(p).startsWith("case")) return { ok: false, error: "invalid match arm" };

    // delegate parsing of single arm to helper to reduce complexity
      const armRes = parseOneArm(inner, p);
    if (!armRes.ok) return armRes as Result<MatchArm[], string>;
    const { arm, next } = armRes.value;
    arms.push(arm);
    p = next;
  }
  if (arms.length === 0) return { ok: false, error: "no match arms" };
  return { ok: true, value: arms };
}

interface OneArmParsed {
  arm: MatchArm;
  next: number;
}

function findArmEnd(inner: string, start: number): number {
  let armEnd = start;
  let armDepth = 0;
  while (armEnd < inner.length) {
    if (inner[armEnd] === "{") armDepth++;
    else if (inner[armEnd] === "}") armDepth--;
    else if (inner[armEnd] === ";" && armDepth === 0) break;
    armEnd++;
  }
  return armEnd;
}

function parseOneArm(inner: string, start: number): Result<OneArmParsed, string> {
  let p = start;
  // expects leading 'case'
  if (!inner.slice(p).startsWith("case")) return { ok: false, error: "invalid match arm" };
  p += 4;
  while (p < inner.length && inner[p] === " ") p++;

  // parse pattern
  let isWildcard = false;
  let patVal: number | undefined = undefined;
  if (inner[p] === "_") {
    isWildcard = true;
    p++;
  } else {
    const num = parseLeadingNumber(inner.slice(p));
    if (!num) return { ok: false, error: "invalid match pattern" };
    patVal = num.value;
    p += num.end;
  }

  while (p < inner.length && inner[p] === " ") p++;
  if (!(inner[p] === "=" && inner[p + 1] === ">")) return { ok: false, error: "invalid match arm" };
  p += 2;
  while (p < inner.length && inner[p] === " ") p++;

  const armEnd = findArmEnd(inner, p);
  const exprText = inner.slice(p, armEnd).trim();

  const arm: MatchArm = { isWildcard, pat: patVal, expr: exprText };

  // compute next position after semicolon if present
  const next = armEnd < inner.length && inner[armEnd] === ";" ? armEnd + 1 : armEnd;
  return { ok: true, value: { arm, next } };
}

export function evaluateMatchArms(
  arms: MatchArm[],
  subjVal: number,
  parentEnv: Map<string, BindingLike> | undefined,
  evalExprFn: (s: string, parentEnv?: Map<string, BindingLike>) => Result<number, string>
): Result<number, string> {
  for (let i = 0; i < arms.length; i++) {
    const arm = arms[i];
    if (arm.expr === "break") return { ok: false, error: "break" };
    if (arm.expr === "continue") return { ok: false, error: "continue" };
    let matched = false;
    if (arm.isWildcard) matched = true;
    else if (arm.pat !== undefined && subjVal === arm.pat) matched = true;
    if (matched) {
      const res = evalExprFn(arm.expr, parentEnv);
      if (!res.ok) return res as Err<string>;
      return { ok: true, value: res.value };
    }
  }
  return { ok: false, error: "no match arm" };
}
