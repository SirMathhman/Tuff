/**
 * Parser utility functions for matching and parsing programming language constructs.
 * Regex-free — all matching is done with character-level scanning.
 */
import { extractIdentifier, skipSpace } from "./string-utils.js";
import {
  isWordChar,
  isDigit,
  isSpace,
  findMatchingParen,
  findMatchingBracket,
  containsWord,
  findWord,
  splitTopLevel,
  replaceWord,
} from "./char-utils.js";

// ── Helpers ─────────────────────────────────────────────

/** Skip past an optional `: ReturnType` annotation. Returns new position. */
function skipReturnType(t: string, i: number): number {
  i = skipSpace(t, i);
  if (i < t.length && t[i] === ":") {
    i++;
    i = skipSpace(t, i);
    while (i < t.length && isWordChar(t[i]!)) i++;
    i = skipSpace(t, i);
  }
  return i;
}

/** Skip past `fn` keyword, identifier, and parens; return position after `)` or -1. */
function skipFnPrefix(t: string, i: number): number {
  if (!t.startsWith("fn", i)) return -1;
  i += 2;
  if (i >= t.length || !isSpace(t[i]!)) return -1;
  i = skipSpace(t, i);
  const name = extractIdentifier(t.slice(i));
  if (name.length === 0) return -1;
  i += name.length;
  i = skipSpace(t, i);
  if (i >= t.length || t[i] !== "(") return -1;
  const cp = findMatchingParen(t, i);
  if (cp === -1) return -1;
  return cp + 1;
}

// ── Predicates ──────────────────────────────────────────

export function isIfStatement(s: string): boolean {
  const i = skipSpace(s);
  return (
    s.startsWith("if(", i) ||
    (s.startsWith("if", i) &&
      skipSpace(s, i + 2) < s.length &&
      s[skipSpace(s, i + 2)] === "(")
  );
}

export function isElseKeyword(s: string): boolean {
  const i = skipSpace(s);
  if (!s.startsWith("else", i)) return false;
  const after = i + 4;
  return after >= s.length || !isWordChar(s[after]!);
}

export function isWhileStatement(s: string): boolean {
  const i = skipSpace(s);
  return (
    s.startsWith("while(", i) ||
    (s.startsWith("while", i) &&
      skipSpace(s, i + 5) < s.length &&
      s[skipSpace(s, i + 5)] === "(")
  );
}

export function isForStatement(s: string): boolean {
  const i = skipSpace(s);
  if (!s.startsWith("for", i)) return false;
  const af = skipSpace(s, i + 3);
  if (af >= s.length || s[af] !== "(") return false;
  const cp = findMatchingParen(s, af);
  if (cp === -1) return false;
  return containsWord(s.slice(af + 1, cp), "in");
}

export function isFnDefinition(s: string): boolean {
  const t = s.trim();
  const i = skipFnPrefix(t, skipSpace(t));
  if (i === -1) return false;
  return t.startsWith("=>", skipReturnType(t, i));
}

export function isTypeAlias(s: string): boolean {
  const t = s.trim();
  let i = skipSpace(t);
  if (!t.startsWith("type", i)) return false;
  i += 4;
  if (i >= t.length || !isSpace(t[i]!)) return false;
  i = skipSpace(t, i);
  const name = extractIdentifier(t.slice(i));
  if (name.length === 0) return false;
  i += name.length;
  if (i < t.length && t[i] === "<") {
    const ca = t.indexOf(">", i);
    if (ca === -1) return false;
    i = ca + 1;
  }
  i = skipSpace(t, i);
  return i < t.length && t[i] === "=";
}

// ── Parsers ──────────────────────────────────────────────

export function parseTypeAlias(
  s: string,
): { name: string; genericParams: string; body: string } | null {
  const t = s.trim();
  let i = skipSpace(t);
  if (!t.startsWith("type", i)) return null;
  i += 4;
  i = skipSpace(t, i);
  const name = extractIdentifier(t.slice(i));
  if (name.length === 0) return null;
  i += name.length;
  let gp = "";
  if (i < t.length && t[i] === "<") {
    const ca = t.indexOf(">", i);
    if (ca === -1) return null;
    gp = t.slice(i + 1, ca).trim();
    i = ca + 1;
  }
  i = skipSpace(t, i);
  if (i >= t.length || t[i] !== "=") return null;
  i++;
  return { name, genericParams: gp, body: t.slice(i).trim() };
}

export function resolveGenericTypeStr(
  typeAnnot: string,
  getAlias: (name: string) => string | undefined,
): string | undefined {
  const t = typeAnnot.trim();
  const ltIdx = t.indexOf("<");
  if (ltIdx === -1) return undefined;
  const name = t.slice(0, ltIdx);
  let depth = 1;
  let gtIdx = -1;
  for (let i = ltIdx + 1; i < t.length; i++) {
    if (t[i] === "<") depth++;
    else if (t[i] === ">") {
      depth--;
      if (depth === 0) {
        gtIdx = i;
        break;
      }
    }
  }
  if (gtIdx === -1) return undefined;
  const args = t.slice(ltIdx + 1, gtIdx).trim();
  const aliasBody = getAlias(name);
  if (aliasBody === undefined) return undefined;
  const resolved = replaceWord(aliasBody, "T", args);
  if (resolved.includes("<") && resolved.includes(">"))
    return resolveGenericTypeStr(resolved, getAlias);
  return resolved;
}

export function parseFnDefinition(s: string): {
  name: string;
  params: string[];
  paramTypes: Map<string, string>;
  body: string;
} | null {
  const t = s.trim();
  const afterParen = skipFnPrefix(t, skipSpace(t));
  if (afterParen === -1) return null;
  // Extract name and params string by rescanning
  let ni = skipSpace(t);
  ni = skipSpace(t, ni + 2);
  const name = extractIdentifier(t.slice(ni));
  ni += name.length;
  ni = skipSpace(t, ni);
  const parenOpen = ni;
  const cp = findMatchingParen(t, parenOpen);
  if (cp === -1) return null;
  const ps = t.slice(parenOpen + 1, cp).trim();
  const i = skipReturnType(t, cp + 1);
  if (!t.startsWith("=>", i)) return null;
  const body = t.slice(i + 2).trim();

  const params: string[] = [];
  const paramTypes = new Map<string, string>();
  if (ps.length > 0) {
    for (const part of splitTopLevel(ps, ",")) {
      const p = part.trim();
      const ci = p.indexOf(":");
      let pn: string;
      let pt: string | undefined;
      if (ci >= 0) {
        pn = p.slice(0, ci).trim();
        pt = p.slice(ci + 1).trim();
        if (pt.startsWith("[")) {
          const cb = findMatchingBracket(pt, 0);
          if (cb !== -1) {
            const inner = pt.slice(1, cb);
            const si = inner.indexOf(";");
            pt =
              "[" + (si >= 0 ? inner.slice(0, si).trim() : inner.trim()) + "]";
          }
        }
        const ri = pt.indexOf("!=");
        if (ri >= 0) pt = pt.slice(0, ri).trim();
      } else {
        pn = p;
      }
      params.push(pn);
      if (pt) paramTypes.set(pn, pt);
    }
  }
  return { name, params, paramTypes, body };
}

export function parseWhileStatement(
  s: string,
): { cond: string; body: string } | null {
  const t = s.trim();
  let i = skipSpace(t);
  if (!t.startsWith("while", i)) return null;
  i += 5;
  i = skipSpace(t, i);
  if (i >= t.length || t[i] !== "(") return null;
  const cp = findMatchingParen(t, i);
  if (cp === -1) return null;
  return { cond: t.slice(i + 1, cp).trim(), body: t.slice(cp + 1).trim() };
}

export function parseForStatement(
  s: string,
): { varName: string; start: string; end: string; body: string } | null {
  const t = s.trim();
  let i = skipSpace(t);
  if (!t.startsWith("for", i)) return null;
  i += 3;
  i = skipSpace(t, i);
  if (i >= t.length || t[i] !== "(") return null;
  const cp = findMatchingParen(t, i);
  if (cp === -1) return null;
  const rs = t.slice(i + 1, cp).trim();
  const body = t.slice(cp + 1).trim();
  const inIdx = findWord(rs, "in");
  if (inIdx === -1) return null;
  const vn = rs.slice(0, inIdx).trim();
  const re = rs.slice(inIdx + 2).trim();
  const dd = re.indexOf("..");
  if (dd === -1) return null;
  return {
    varName: vn,
    start: re.slice(0, dd).trim(),
    end: re.slice(dd + 2).trim(),
    body,
  };
}

export function parseAssignment(s: string): {
  name: string;
  indices: string[];
  isCompound: boolean;
  op: string;
  rhs: string;
} | null {
  const t = s.trim();
  const name = extractIdentifier(t);
  if (name.length === 0) return null;
  let pos = name.length;
  const indices: string[] = [];
  while (pos < t.length) {
    pos = skipSpace(t, pos);
    if (pos < t.length && t[pos] === "[") {
      const cl = findMatchingBracket(t, pos);
      if (cl === -1) return null;
      indices.push(t.slice(pos + 1, cl));
      pos = cl + 1;
    } else break;
  }
  pos = skipSpace(t, pos);
  let isCompound = false;
  let op = "=";
  if (pos < t.length && (t[pos] === "+" || t[pos] === "-")) {
    const np = pos + 1;
    if (np < t.length && t[np] === "=") {
      isCompound = true;
      op = t[pos] + "=";
      pos = np + 1;
    }
  }
  if (!isCompound) {
    if (pos >= t.length || t[pos] !== "=") return null;
    pos++;
  }
  const rhs = t.slice(pos).trim();
  if (rhs.length === 0) return null;
  return { name, indices, isCompound, op, rhs };
}

export function parseRefinementValueType(
  s: string,
): { value: number; type: string } | null {
  const t = s.trim();
  let i = 0;
  let sign = 1;
  if (i < t.length && t[i] === "-") {
    sign = -1;
    i++;
  }
  if (i >= t.length || !isDigit(t[i]!)) return null;
  let ns = "";
  while (i < t.length && isDigit(t[i]!)) {
    ns += t[i];
    i++;
  }
  if (i < t.length && t[i] === ".") {
    ns += ".";
    i++;
    while (i < t.length && isDigit(t[i]!)) {
      ns += t[i];
      i++;
    }
  }
  return { value: sign * parseFloat(ns), type: t.slice(i).trim() || "I32" };
}

