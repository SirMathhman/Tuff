interface NumToken {
  type: "num";
  value: number;
}

interface OpToken {
  type: "op";
  op: "+" | "-" | "*" | "/";
}

interface ParenToken {
  type: "paren";
  paren: "(" | ")" | "{" | "}";
}

type Token = NumToken | OpToken | ParenToken;

const OPEN_PARENS: Record<string, string> = {
  "(": ")",
  "{": "}",
};

/**
 * Structured error codes for `evaluate`. Each error answers:
 * what happened, where, why it's an error, and how to fix it.
 */
export enum EvalErrorCode {
  UnexpectedCharacter = "UnexpectedCharacter",
  UnexpectedEnd = "UnexpectedEnd",
  ExpectedNumber = "ExpectedNumber",
  TrailingTokens = "TrailingTokens",
  ExpectedCloseParen = "ExpectedCloseParen",
}

interface EvalError {
  code: EvalErrorCode;
  /** The full input that failed, so the caller can locate the problem. */
  input: string;
  /** 0-based index into `input` where the problem was detected, if known. */
  position?: number;
  /** Human-readable explanation of what went wrong and how to fix it. */
  message: string;
}

interface EvalSuccess {
  ok: true;
  value: number;
}

interface EvalFailure {
  ok: false;
  error: EvalError;
}

type EvalResult = EvalSuccess | EvalFailure;

interface TokenizeSuccess extends EvalSuccess {
  tokens: Token[];
}

type TokenizeResult = TokenizeSuccess | EvalFailure;

interface ParseSuccess extends EvalSuccess {
  next: number;
}

type ParseResult = ParseSuccess | EvalFailure;

function err(
  code: EvalErrorCode,
  input: string,
  message: string,
  position?: number,
): EvalFailure {
  return { ok: false, error: { code, input, message, position } };
}

function tokenize(input: string): TokenizeResult {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === undefined) break;
    if (ch === " ") {
      i++;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < input.length && /[0-9]/.test(input[j] ?? "")) j++;
      tokens.push({ type: "num", value: Number(input.slice(i, j)) });
      i = j;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ type: "op", op: ch });
      i++;
      continue;
    }
    if (ch === "(" || ch === ")" || ch === "{" || ch === "}") {
      tokens.push({ type: "paren", paren: ch });
      i++;
      continue;
    }
    return err(
      EvalErrorCode.UnexpectedCharacter,
      input,
      `Unexpected character "${ch}". Only digits, + - * /, and ( ) are allowed.`,
      i,
    );
  }
  return { ok: true, value: 0, tokens };
}

function parseExpression(tokens: Token[], pos: number): ParseResult {
  const term = parseTerm(tokens, pos);
  if (!term.ok) return term;
  let value = term.value;
  let next = term.next;
  while (next < tokens.length) {
    const tok = tokens[next];
    if (tok && tok.type === "op" && (tok.op === "+" || tok.op === "-")) {
      const rhs = parseTerm(tokens, next + 1);
      if (!rhs.ok) return rhs;
      value = tok.op === "+" ? value + rhs.value : value - rhs.value;
      next = rhs.next;
    } else {
      break;
    }
  }
  return { ok: true, value, next };
}

function parseTerm(tokens: Token[], pos: number): ParseResult {
  const factor = parseFactor(tokens, pos);
  if (!factor.ok) return factor;
  let value = factor.value;
  let next = factor.next;
  while (next < tokens.length) {
    const tok = tokens[next];
    if (tok && tok.type === "op" && (tok.op === "*" || tok.op === "/")) {
      const rhs = parseFactor(tokens, next + 1);
      if (!rhs.ok) return rhs;
      value = tok.op === "*" ? value * rhs.value : value / rhs.value;
      next = rhs.next;
    } else {
      break;
    }
  }
  return { ok: true, value, next };
}

function parseFactor(tokens: Token[], pos: number): ParseResult {
  const tok = tokens[pos];
  if (!tok) {
    return err(
      EvalErrorCode.UnexpectedEnd,
      "",
      "Expression ended before a number was found. Add a number.",
      pos,
    );
  }
  if (tok.type === "num") return { ok: true, value: tok.value, next: pos + 1 };
  if (tok.type === "paren" && tok.paren in OPEN_PARENS) {
    const expectedClose = OPEN_PARENS[tok.paren];
    const inner = parseExpression(tokens, pos + 1);
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
    return { ok: true, value: inner.value, next: inner.next + 1 };
  }
  return err(
    EvalErrorCode.ExpectedNumber,
    "",
    "A number or ( was expected here. Check operator placement.",
    pos,
  );
}

export function evaluate(input: string): EvalResult {
  if (input === "") return { ok: true, value: 0 };
  const tokens = tokenize(input);
  if (!tokens.ok) return tokens;
  const result = parseExpression(tokens.tokens, 0);
  if (!result.ok) return result;
  if (result.next !== tokens.tokens.length) {
    return err(
      EvalErrorCode.TrailingTokens,
      input,
      "Unexpected trailing tokens. Remove extra characters or operators.",
    );
  }
  return { ok: true, value: result.value };
}
