import { EvalErrorCode, err } from "./errors.ts";
import type { Token } from "./tokens.ts";
import type { Env, Value } from "./env.ts";
import type { ParseBlockFn, ParseResult } from "./expressions.ts";

/** Parses a full expression. Provided by the expressions module. */
export type ParseExpressionFn = (
  tokens: Token[],
  pos: number,
  env: Env,
  parseBlock: ParseBlockFn,
) => ParseResult;

function num(n: number): Value {
  return { kind: "num", num: n };
}

function bool(b: boolean): Value {
  return { kind: "bool", num: b ? 1 : 0 };
}

export function parseFactor(
  tokens: Token[],
  pos: number,
  env: Env,
  parseBlock: ParseBlockFn,
  parseExpression: ParseExpressionFn,
): ParseResult {
  const tok = tokens[pos];
  if (!tok) {
    return err(
      EvalErrorCode.UnexpectedEnd,
      "",
      "Expression ended before a number was found. Add a number.",
      pos,
    );
  }
  let base: ParseResult;
  if (tok.type === "num") {
    base = { ok: true, value: num(tok.value), next: pos + 1 };
  } else if (tok.type === "bool") {
    base = { ok: true, value: bool(tok.value), next: pos + 1 };
  } else if (tok.type === "ref") {
    base = err(
      EvalErrorCode.ReferenceInExpression,
      "",
      `"&" takes a reference and can only be used in a "let" binding (e.g. "let y = &x"). To read the value a reference points to, use "*" (e.g. "*y").`,
      pos,
    );
  } else if (tok.type === "op" && tok.op === "*") {
    base = parseDeref(tokens, pos, env);
  } else if (tok.type === "ident") {
    base = lookupIdent(tokens, pos, env);
  } else if (tok.type === "paren" && tok.paren === "[") {
    base = parseArrayLiteral(tokens, pos, env, parseBlock, parseExpression);
  } else if (tok.type === "paren" && tok.paren in OPEN_PARENS) {
    const expectedClose = OPEN_PARENS[tok.paren];
    if (tok.paren === "{") {
      base = parseBlock(tokens, pos + 1, env);
    } else {
      const inner = parseExpression(tokens, pos + 1, env, parseBlock);
      if (!inner.ok) return inner;
      const close = tokens[inner.next];
      if (!close || close.type !== "paren" || close.paren !== expectedClose) {
        return err(
          EvalErrorCode.ExpectedCloseParen,
          "",
          `A closing "${expectedClose}" was expected. Add a matching "${expectedClose}".`,
          inner.next,
        );
      }
      base = { ok: true, value: inner.value, next: inner.next + 1 };
    }
  } else {
    return err(
      EvalErrorCode.ExpectedNumber,
      "",
      "A number, variable, or ( was expected here. Check operator placement.",
      pos,
    );
  }
  if (!base.ok) return base;
  return applyIndexAccess(tokens, base.next, env, parseBlock, parseExpression, base.value);
}

/** Parses `ident` and returns its bound value. */
function lookupIdent(tokens: Token[], pos: number, env: Env): ParseResult {
  const tok = tokens[pos];
  if (!tok || tok.type !== "ident") {
    return err(
      EvalErrorCode.ExpectedNumber,
      "",
      "A number, variable, or ( was expected here. Check operator placement.",
      pos,
    );
  }
  const bound = env.get(tok.name);
  if (bound === undefined) {
    return err(
      EvalErrorCode.UnknownVariable,
      "",
      `Variable "${tok.name}" is not defined. Declare it with "let ${tok.name} = ...".`,
      pos,
    );
  }
  return { ok: true, value: bound.value, next: pos + 1 };
}

/** Parses a unary `*ident` dereference. `pos` points at the `*`. */
function parseDeref(tokens: Token[], pos: number, env: Env): ParseResult {
  const inner = tokens[pos + 1];
  if (!inner || inner.type !== "ident") {
    return err(
      EvalErrorCode.ExpectedReferenceTarget,
      "",
      `A variable name was expected after "*". Write "*<variable>" to dereference.`,
      pos + 1,
    );
  }
  const bound = env.get(inner.name);
  if (bound === undefined) {
    return err(
      EvalErrorCode.UnknownVariable,
      "",
      `Variable "${inner.name}" is not defined. Declare it with "let ${inner.name} = ...".`,
      pos + 1,
    );
  }
  if (bound.refTo === undefined) {
    return err(
      EvalErrorCode.DerefOfNonReference,
      "",
      `Variable "${inner.name}" is not a reference. Create one with "let ${inner.name} = &<variable>".`,
      pos,
    );
  }
  const target = env.get(bound.refTo);
  if (target === undefined) {
    return err(
      EvalErrorCode.UnknownVariable,
      "",
      `Variable "${bound.refTo}" is not defined. It was referenced by "${inner.name}".`,
      pos,
    );
  }
  return { ok: true, value: target.value, next: pos + 2 };
}

/**
 * Parses an array literal `[ expr (, expr)* ]`. `pos` points at the `[`.
 * Returns `next` just past the `]`.
 */
function parseArrayLiteral(
  tokens: Token[],
  pos: number,
  env: Env,
  parseBlock: ParseBlockFn,
  parseExpression: ParseExpressionFn,
): ParseResult {
  const items: Value[] = [];
  let cursor = pos + 1;
  const close = tokens[cursor];
  if (close && close.type === "paren" && close.paren === "]") {
    return {
      ok: true,
      value: { kind: "array", num: 0, items },
      next: cursor + 1,
    };
  }
  for (;;) {
    const item = parseExpression(tokens, cursor, env, parseBlock);
    if (!item.ok) return item;
    items.push(item.value);
    cursor = item.next;
    const sep = tokens[cursor];
    if (sep && sep.type === "comma") {
      cursor++;
      continue;
    }
    if (sep && sep.type === "paren" && sep.paren === "]") {
      return {
        ok: true,
        value: { kind: "array", num: 0, items },
        next: cursor + 1,
      };
    }
    return err(
      EvalErrorCode.ExpectedCommaOrCloseBracket,
      "",
      `A "," or "]" was expected inside the array literal.`,
      cursor,
    );
  }
}

/**
 * Applies zero or more postfix `[ index ]` accesses to `value`, starting at
 * token position `pos`. Indexing requires an array and a numeric index in
 * range.
 */
function applyIndexAccess(
  tokens: Token[],
  pos: number,
  env: Env,
  parseBlock: ParseBlockFn,
  parseExpression: ParseExpressionFn,
  value: Value,
): ParseResult {
  let current = value;
  let cursor = pos;
  while (cursor < tokens.length) {
    const open = tokens[cursor];
    if (!open || open.type !== "paren" || open.paren !== "[") break;
    if (current.kind !== "array") {
      return err(
        EvalErrorCode.IndexOnNonArray,
        "",
        `"[" can only index an array, but the value is a ${current.kind}. Build an array with "[ ... ]".`,
        cursor,
      );
    }
    const index = parseExpression(tokens, cursor + 1, env, parseBlock);
    if (!index.ok) return index;
    const close = tokens[index.next];
    if (!close || close.type !== "paren" || close.paren !== "]") {
      return err(
        EvalErrorCode.ExpectedCloseParen,
        "",
        `A closing "]" was expected after the index. Add a matching "]".`,
        index.next,
      );
    }
    if (index.value.kind !== "num") {
      return err(
        EvalErrorCode.IndexMustBeNumber,
        "",
        `An array index must be a number, but it is a ${index.value.kind}.`,
        cursor + 1,
      );
    }
    const idx = index.value.num;
    const items = current.items ?? [];
    if (!Number.isInteger(idx) || idx < 0 || idx >= items.length) {
      return err(
        EvalErrorCode.IndexOutOfBounds,
        "",
        `Index ${idx} is out of bounds for an array of length ${items.length}. Use an index between 0 and ${items.length - 1}.`,
        cursor + 1,
      );
    }
    const item = items[idx];
    if (item === undefined) {
      return err(
        EvalErrorCode.IndexOutOfBounds,
        "",
        `Index ${idx} is out of bounds for an array of length ${items.length}.`,
        cursor + 1,
      );
    }
    current = item;
    cursor = index.next + 1;
  }
  return { ok: true, value: current, next: cursor };
}

const OPEN_PARENS: Record<string, string> = {
  "(": ")",
  "{": "}",
};
