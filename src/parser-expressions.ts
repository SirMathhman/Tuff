import type { Token, ScopeValue, EvalContext } from "./types.js";
import { isOp, peek, consume, tokenize } from "./tokenizer.js";
import { promoteTypes } from "./type-utils.js";
import {
  getTypeAnnotations,
  getPointerTargets,
  getNonZeroSet,
} from "./shared-state.js";

// Lazy reference to break circular dependency.
let resolveBlocksWithScope: (
  input: string,
  scope: Map<string, ScopeValue>,
) => number;
export function setResolveBlocks(
  fn: (input: string, scope: Map<string, ScopeValue>) => number,
): void {
  resolveBlocksWithScope = fn;
}

/** Parse an object literal like `{ key1 : val1, key2 : val2 }`. */
export function parseObjectLiteral(
  tokens: Token[],
  pos: [number],
  scope: Map<string, ScopeValue>,
): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  while (true) {
    const n = peek(tokens, pos);
    if (!n || (isOp(n) && n.value === "}")) break;
    if (n.type !== "id") throw new Error("Expected object property name");
    consume(tokens, pos);
    const pn = n.value;
    const ct = peek(tokens, pos);
    if (!ct || !isOp(ct) || ct.value !== ":")
      throw new Error("Expected ':' after object property name");
    consume(tokens, pos);
    obj[pn] = parseExpression(
      tokens,
      pos,
      scope as unknown as Map<string, unknown>,
    );
  }
  return obj;
}

/** Get and delete a function definition from scope. */
export function getFunction(
  scope: Map<string, ScopeValue>,
  name: string,
):
  | { body: string; params: string[]; paramTypes?: Map<string, string> }
  | undefined {
  const fn = scope.get("__fn__" + name);
  if (fn !== undefined) {
    scope.delete("__fn__" + name);
    return fn as {
      body: string;
      params: string[];
      paramTypes?: Map<string, string>;
    };
  }
  return undefined;
}

const e = "Type mismatch for parameter '";
function validateArgType(a: unknown, t: string, n: string): void {
  if (t.startsWith("[")) {
    if (!Array.isArray(a))
      throw new Error(e + n + "': expected " + t + ", but got non-array value");
    return;
  }
  if (isNumericType(t)) {
    if (typeof a !== "number")
      throw new Error(
        e + n + "': expected " + t + ", but got non-numeric value",
      );
    return;
  }
  if (t === "Bool" || t === "bool") {
    if (typeof a !== "number" && typeof a !== "boolean")
      throw new Error(
        e + n + "': expected " + t + ", but got incompatible value",
      );
    return;
  }
  if (t === "Void")
    throw new Error(e + n + "': expected Void, but got a value");
}

function isUnsignedSuffix(suffix: string): boolean {
  return suffix.length > 0 && (suffix[0] === "u" || suffix[0] === "U");
}
function isNumericType(s: string): boolean {
  if (s.length < 2) return false;
  const f = s[0]!;
  if (f !== "I" && f !== "U" && f !== "F") return false;
  for (let i = 1; i < s.length; i++) {
    if (s.charCodeAt(i) < 48 || s.charCodeAt(i) > 57) return false;
  }
  return true;
}
function isComparisonOp(t: Token): boolean {
  return (
    (isOp(t) && "<>".includes(t.value[0]!)) ||
    t.value === "==" ||
    t.value === "!=" ||
    t.value === "<=" ||
    t.value === ">="
  );
}

/** Resolve an identifier token, handling function calls and chained access. */
export function resolveIdentifier(
  tokens: Token[],
  pos: [number],
  scope: Map<string, ScopeValue>,
): unknown {
  const token = peek(tokens, pos);
  if (!token || token.type !== "id") throw new Error("Expected identifier");
  consume(tokens, pos);
  const nt = peek(tokens, pos);
  if (nt && isOp(nt) && nt.value === "(") {
    const fd = getFunction(scope, token.value);
    if (fd === undefined) throw new Error("Undefined function: " + token.value);
    consume(tokens, pos);
    const args: unknown[] = [];
    while (true) {
      const pn = peek(tokens, pos);
      if (!pn || (isOp(pn) && pn.value === ")")) break;
      args.push(
        isOp(pn) && pn.value === "["
          ? parseValuePrimary(tokens, pos, scope)
          : parseExpression(
              tokens,
              pos,
              scope as unknown as Map<string, unknown>,
            ),
      );
    }
    const cp = peek(tokens, pos);
    if (cp && isOp(cp) && cp.value === ")") consume(tokens, pos);
    const fs = new Map(scope);
    for (let i = 0; i < fd.params.length; i++) {
      const pn = fd.params[i];
      if (pn !== undefined && args[i] !== undefined) {
        if (fd.paramTypes) {
          const et = fd.paramTypes.get(pn);
          if (et) validateArgType(args[i], et, pn);
        }
        fs.set(pn, args[i]);
      }
    }
    return resolveBlocksWithScope(fd.body, fs);
  }
  let v = scope.get(token.value);
  if (v === undefined) throw new Error("Undefined variable: " + token.value);
  while (true) {
    const nt = peek(tokens, pos);
    if (!nt || !isOp(nt)) break;
    if (nt.value === "[") {
      consume(tokens, pos);
      const idx = parseExpression(
        tokens,
        pos,
        scope as unknown as Map<string, unknown>,
      );
      consume(tokens, pos);
      if (!Array.isArray(v)) throw new Error("Cannot index non-array");
      v = (v as unknown[])[idx];
    } else if (nt.value === ".") {
      consume(tokens, pos);
      const pt = peek(tokens, pos);
      if (!pt) throw new Error("Expected property name after dot");
      if (pt.type === "number") {
        consume(tokens, pos);
        if (typeof v === "object" && v !== null && "__tuple__" in v)
          v = (v as unknown as Record<string, unknown> & { values: unknown[] })
            .values[pt.value];
        else
          throw new Error(
            "Cannot access tuple field on non-tuple: " + String(v),
          );
      } else if (pt.type === "id") {
        consume(tokens, pos);
        if (typeof v === "object" && v !== null)
          v = (v as Record<string, unknown>)[pt.value];
        else
          throw new Error("Cannot access property on non-object: " + String(v));
      } else
        throw new Error("Expected property name or numeric field after dot");
    } else break;
  }
  return v;
}

function parseValuePrimary(
  tokens: Token[],
  pos: [number],
  scope: Map<string, ScopeValue>,
): unknown {
  const t = peek(tokens, pos);
  if (!t) throw new Error("Unexpected end of input");
  if (t.type === "number") {
    consume(tokens, pos);
    return t.value;
  }
  if (t.type === "boolean") {
    consume(tokens, pos);
    return t.value ? 1 : 0;
  }
  if (isOp(t) && t.value === "[") {
    consume(tokens, pos);
    const a: unknown[] = [];
    while (true) {
      const n = peek(tokens, pos);
      if (!n || (isOp(n) && n.value === "]")) break;
      a.push(parseValuePrimary(tokens, pos, scope));
    }
    consume(tokens, pos);
    return a;
  }
  if (isOp(t) && t.value === "(") {
    consume(tokens, pos);
    const tu: unknown[] = [];
    while (true) {
      const n = peek(tokens, pos);
      if (!n || (isOp(n) && n.value === ")")) break;
      if (!(isOp(n) && n.value === ","))
        tu.push(parseValuePrimary(tokens, pos, scope));
      else consume(tokens, pos);
    }
    consume(tokens, pos);
    return { __tuple__: true, values: tu };
  }
  if (t.type === "id") return resolveIdentifier(tokens, pos, scope);
  throw new Error("Unexpected token: " + t.type);
}

function evaluateComparison(l: number, op: string, r: number): number {
  switch (op) {
    case "<":
      return l < r ? 1 : 0;
    case ">":
      return l > r ? 1 : 0;
    case "<=":
      return l <= r ? 1 : 0;
    case ">=":
      return l >= r ? 1 : 0;
    case "==":
      return l === r ? 1 : 0;
    case "!=":
      return l !== r ? 1 : 0;
    default:
      throw new Error("Unknown comparison operator: " + op);
  }
}

function parseComparison(
  tokens: Token[],
  pos: [number],
  scope: Map<string, unknown>,
  ctx?: EvalContext,
): number {
  let l = parseTerm(tokens, pos, scope, ctx);
  while (true) {
    const ct = peek(tokens, pos);
    if (!ct || !isComparisonOp(ct)) break;
    consume(tokens, pos);
    l = evaluateComparison(
      l,
      ct.value as string,
      parseTerm(tokens, pos, scope, ctx),
    );
  }
  if (ctx) {
    const it = peek(tokens, pos);
    if (it && it.type === "id" && it.value.toLowerCase() === "is") {
      consume(tokens, pos);
      const tt = peek(tokens, pos);
      if (!tt || tt.type !== "id")
        throw new Error("Expected type name after 'is'");
      consume(tokens, pos);
      l = ctx.lastResultType === tt.value ? 1 : 0;
    }
  }
  return l;
}

export function parseExpression(
  tokens: Token[],
  pos: [number],
  scope: Map<string, unknown>,
  ctx?: EvalContext,
): number {
  let l = parseComparison(tokens, pos, scope, ctx);
  while (true) {
    const ct = peek(tokens, pos);
    if (!ct || !isOp(ct) || !"+-".includes(ct.value)) break;
    consume(tokens, pos);
    const sl = ctx?.lastResultType;
    const r = parseTerm(tokens, pos, scope, ctx);
    if (ctx && sl && ctx.lastResultType)
      ctx.lastResultType = promoteTypes(sl, ctx.lastResultType);
    else if (ctx) ctx.lastResultType = undefined;
    l = ct.value === "+" ? l + r : l - r;
  }
  return l;
}

function parseTerm(
  tokens: Token[],
  pos: [number],
  scope: Map<string, unknown>,
  ctx?: EvalContext,
): number {
  let l = parseUnary(tokens, pos, scope, ctx);
  while (true) {
    const ct = peek(tokens, pos);
    if (!ct || !isOp(ct) || !"*/".includes(ct.value)) break;
    consume(tokens, pos);
    if (ctx && ct.value === "/") ctx.isDivisor = true;
    const r = parseUnary(tokens, pos, scope, ctx);
    if (ctx) ctx.isDivisor = false;
    l = ct.value === "*" ? l * r : l / r;
  }
  return l;
}

function parseUnary(
  tokens: Token[],
  pos: [number],
  scope: Map<string, unknown>,
  ctx?: EvalContext,
): number {
  while (true) {
    const ct = peek(tokens, pos);
    if (!ct || !isOp(ct)) break;
    if (ct.value === "*") {
      const nxt = tokens[pos[0] + 1];
      if (nxt && nxt.type === "id") {
        consume(tokens, pos);
        const ptr = getPointerTargets(
          scope as unknown as Map<string, ScopeValue>,
        );
        const tn = ptr.get(nxt.value);
        if (!tn)
          throw new Error(
            "Cannot dereference non-pointer variable: " + nxt.value,
          );
        const r = resolveIdentifier(
          tokens,
          pos,
          scope as unknown as Map<string, ScopeValue>,
        );
        return typeof r === "number" ? r : 0;
      } else break;
    }
    if (ct.value !== "-" && ct.value !== "+") break;
    const nxt = tokens[pos[0] + 1];
    if (nxt?.type === "number" && nxt.suffix && isUnsignedSuffix(nxt.suffix))
      throw new Error(
        "Cannot apply unary minus to unsigned typed literal: -" +
          String(nxt.value) +
          String(nxt.suffix),
      );
    consume(tokens, pos);
    const op = parseUnary(tokens, pos, scope, ctx);
    return typeof op === "number" ? (ct.value === "-" ? -op : op) : op;
  }
  return parsePrimary(tokens, pos, scope, ctx);
}

function parseIfExpr(
  tokens: Token[],
  pos: [number],
  scope: Map<string, unknown>,
): number {
  consume(tokens, pos);
  const pt = peek(tokens, pos);
  if (pt && isOp(pt) && pt.value === "(") {
    consume(tokens, pos);
    const c = parseExpression(tokens, pos, scope);
    const cp = peek(tokens, pos);
    if (cp && isOp(cp) && cp.value === ")") consume(tokens, pos);
    const tv = parseExpression(tokens, pos, scope);
    const nt = peek(tokens, pos);
    if (nt && nt.type === "keyword" && nt.value === "else") {
      consume(tokens, pos);
      return c !== 0 ? tv : parseExpression(tokens, pos, scope);
    }
    return tv;
  }
  throw new Error("Expected condition after if");
}

function parsePrimary(
  tokens: Token[],
  pos: [number],
  scope: Map<string, unknown>,
  ctx?: EvalContext,
): number {
  const t = peek(tokens, pos);
  if (t && t.type === "keyword" && t.value === "if")
    return parseIfExpr(tokens, pos, scope);
  if (t && isOp(t) && t.value === "(") {
    const sp = pos[0];
    try {
      const vr = parseValuePrimary(
        tokens,
        pos,
        scope as unknown as Map<string, ScopeValue>,
      );
      if (typeof vr === "object" && vr !== null && "__tuple__" in vr) {
        const tvs = (vr as Record<string, unknown>).values;
        return Array.isArray(tvs) ? Number(tvs[0] ?? 0) : 0;
      }
    } catch {
      /* not value */
    }
    pos[0] = sp;
    consume(tokens, pos);
    const r = parseExpression(tokens, pos, scope, ctx);
    const cp = peek(tokens, pos);
    if (!cp || !isOp(cp) || cp.value !== ")")
      throw new Error("Expected closing parenthesis");
    consume(tokens, pos);
    return r;
  }
  if (ctx && t?.type === "number") ctx.lastResultType = t.suffix ?? "I32";
  else if (ctx) {
    if (t?.type === "id") {
      ctx.lastResultType =
        getTypeAnnotations(scope as unknown as Map<string, ScopeValue>).get(
          t.value,
        ) ?? undefined;
      if (
        ctx.isDivisor &&
        !getNonZeroSet(scope as unknown as Map<string, ScopeValue>).has(t.value)
      )
        throw new Error(
          "Division by variable '" +
            t.value +
            "' without != 0 refinement is not allowed",
        );
    } else ctx.lastResultType = undefined;
  }
  const v = parseValuePrimary(
    tokens,
    pos,
    scope as unknown as Map<string, ScopeValue>,
  );
  return typeof v === "number" ? v : 0;
}

/** Evaluate an expression string and return a number. */
export function evaluateExpression(
  input: string,
  scope?: Map<string, unknown>,
): number {
  const tokens = tokenize(input);
  if (tokens.length === 0) throw new Error("Empty expression");
  return parseExpression(tokens, [0], scope ?? new Map(), {
    lastResultType: undefined,
    isDivisor: false,
  });
}

/** Extract the inferred type of an expression without evaluating it. */
export function inferExpressionType(
  input: string,
  scope?: Map<string, unknown>,
): string | undefined {
  const tokens = tokenize(input);
  if (tokens.length === 0) throw new Error("Empty expression");
  const ctx: EvalContext = { lastResultType: undefined, isDivisor: false };
  parseExpression(tokens, [0], scope ?? new Map(), ctx);
  return ctx.lastResultType;
}

/** Parse a value expression that can be a number, array, or object. */
export function parseValue(
  input: string,
  scope: Map<string, ScopeValue>,
): unknown {
  const tokens = tokenize(input.trim());
  if (tokens.length === 0) throw new Error("Empty expression");

  // If the first token is an array literal start or tuple literal start, parse as value
  if (
    isOp(tokens[0]!) &&
    (tokens[0].value === "[" || tokens[0].value === "(")
  ) {
    return parseValuePrimary(tokens, [0], scope);
  }

  // Object literal: { key : expr } - detect by opening brace followed by identifier and colon
  const third = peek(tokens, [2]);
  if (
    isOp(tokens[0]!) &&
    tokens[0].value === "{" &&
    peek(tokens, [1])?.type === "id" &&
    third !== undefined &&
    isOp(third) &&
    third.value === ":"
  ) {
    consume(tokens, [0]); // consume {
    const obj = parseObjectLiteral(tokens, [0], scope);
    return obj;
  }

  return parseExpression(tokens, [0], scope as unknown as Map<string, unknown>);
}
