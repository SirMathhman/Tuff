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

interface IdentToken {
  type: "ident";
  name: string;
}

interface KeywordToken {
  type: "keyword";
  keyword: "let";
}

interface AssignToken {
  type: "assign";
}

interface SemicolonToken {
  type: "semicolon";
}

type Token =
  | NumToken
  | OpToken
  | ParenToken
  | IdentToken
  | KeywordToken
  | AssignToken
  | SemicolonToken;

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
  UnknownVariable = "UnknownVariable",
  ExpectedIdentifier = "ExpectedIdentifier",
  ExpectedAssign = "ExpectedAssign",
  ExpectedSemicolon = "ExpectedSemicolon",
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
    if (ch === "=") {
      tokens.push({ type: "assign" });
      i++;
      continue;
    }
    if (ch === ";") {
      tokens.push({ type: "semicolon" });
      i++;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < input.length && /[a-zA-Z0-9_]/.test(input[j] ?? "")) j++;
      const word = input.slice(i, j);
      if (word === "let") tokens.push({ type: "keyword", keyword: "let" });
      else tokens.push({ type: "ident", name: word });
      i = j;
      continue;
    }
    return err(
      EvalErrorCode.UnexpectedCharacter,
      input,
      `Unexpected character "${ch}". Only digits, + - * /, ( ) { }, let, =, ;, and identifiers are allowed.`,
      i,
    );
  }
  return { ok: true, value: 0, tokens };
}

type Env = Map<string, number>;

function parseExpression(tokens: Token[], pos: number, env: Env): ParseResult {
  const term = parseTerm(tokens, pos, env);
  if (!term.ok) return term;
  let value = term.value;
  let next = term.next;
  while (next < tokens.length) {
    const tok = tokens[next];
    if (tok && tok.type === "op" && (tok.op === "+" || tok.op === "-")) {
      const rhs = parseTerm(tokens, next + 1, env);
      if (!rhs.ok) return rhs;
      value = tok.op === "+" ? value + rhs.value : value - rhs.value;
      next = rhs.next;
    } else {
      break;
    }
  }
  return { ok: true, value, next };
}

function parseTerm(tokens: Token[], pos: number, env: Env): ParseResult {
  const factor = parseFactor(tokens, pos, env);
  if (!factor.ok) return factor;
  let value = factor.value;
  let next = factor.next;
  while (next < tokens.length) {
    const tok = tokens[next];
    if (tok && tok.type === "op" && (tok.op === "*" || tok.op === "/")) {
      const rhs = parseFactor(tokens, next + 1, env);
      if (!rhs.ok) return rhs;
      value = tok.op === "*" ? value * rhs.value : value / rhs.value;
      next = rhs.next;
    } else {
      break;
    }
  }
  return { ok: true, value, next };
}

function parseFactor(tokens: Token[], pos: number, env: Env): ParseResult {
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
  if (tok.type === "ident") {
    const bound = env.get(tok.name);
    if (bound === undefined) {
      return err(
        EvalErrorCode.UnknownVariable,
        "",
        `Variable "${tok.name}" is not defined. Declare it with "let ${tok.name} = ...".`,
        pos,
      );
    }
    return { ok: true, value: bound, next: pos + 1 };
  }
  if (tok.type === "paren" && tok.paren in OPEN_PARENS) {
    const expectedClose = OPEN_PARENS[tok.paren];
    if (tok.paren === "{") {
      const block = parseBlock(tokens, pos + 1, env);
      if (!block.ok) return block;
      return { ok: true, value: block.value, next: block.next };
    }
    const inner = parseExpression(tokens, pos + 1, env);
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
    "A number, variable, or ( was expected here. Check operator placement.",
    pos,
  );
}

/**
 * Parses zero or more `let ident = expr ;` bindings followed by a trailing
 * expression. Bindings are added to a child env so they don't leak out.
 * Returns the trailing expression's value and `next` just past it.
 */
function parseStatements(tokens: Token[], pos: number, env: Env): ParseResult {
  const localEnv = new Map(env);
  let cursor = pos;
  while (cursor < tokens.length) {
    const tok = tokens[cursor];
    if (!tok) break;
    if (tok.type === "keyword" && tok.keyword === "let") {
      const ident = tokens[cursor + 1];
      if (!ident || ident.type !== "ident") {
        return err(
          EvalErrorCode.ExpectedIdentifier,
          "",
          "An identifier was expected after 'let'.",
          cursor + 1,
        );
      }
      const assign = tokens[cursor + 2];
      if (!assign || assign.type !== "assign") {
        return err(
          EvalErrorCode.ExpectedAssign,
          "",
          `"=" was expected after the variable name "${ident.name}".`,
          cursor + 2,
        );
      }
      const value = parseExpression(tokens, cursor + 3, localEnv);
      if (!value.ok) return value;
      const semi = tokens[value.next];
      if (!semi || semi.type !== "semicolon") {
        return err(
          EvalErrorCode.ExpectedSemicolon,
          "",
          `";" was expected after the value of "${ident.name}".`,
          value.next,
        );
      }
      localEnv.set(ident.name, value.value);
      cursor = value.next + 1;
      continue;
    }
    break;
  }
  return parseExpression(tokens, cursor, localEnv);
}

/**
 * Parses the body of a `{ ... }` block: statements followed by a closing `}`.
 * `pos` points just past the opening `{`. Returns `next` just past the `}`.
 */
function parseBlock(tokens: Token[], pos: number, env: Env): ParseResult {
  const body = parseStatements(tokens, pos, env);
  if (!body.ok) return body;
  const close = tokens[body.next];
  if (!close || close.type !== "paren" || close.paren !== "}") {
    return err(
      EvalErrorCode.ExpectedCloseParen,
      "",
      'A closing "}" was expected. Add a matching "}".',
      body.next,
    );
  }
  return { ok: true, value: body.value, next: body.next + 1 };
}

export function evaluate(input: string): EvalResult {
  if (input === "") return { ok: true, value: 0 };
  const tokens = tokenize(input);
  if (!tokens.ok) return tokens;
  const result = parseStatements(tokens.tokens, 0, new Map());
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
