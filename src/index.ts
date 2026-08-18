export interface Ok<T> {
  ok: true;
  value: T;
}

export interface Err<E> {
  ok: false;
  error: E;
}

export type Result<T, E> = Ok<T> | Err<E>;

export enum EvaluateErrorKind {
  ParseError = "ParseError",
}

export interface EvaluateError {
  kind: EvaluateErrorKind;
  input: string;
  position: number;
  message: string;
}

const NUMBER_PATTERN = /^(\d+(\.\d*)?|\.\d+)/;

function skipWhitespace(input: string, pos: number): number {
  while (pos < input.length && /\s/.test(input.charAt(pos))) {
    pos++;
  }
  return pos;
}

interface ParseFailure {
  position: number;
  reason: string;
}

function parseNumber(
  input: string,
  pos: number,
): Result<[number, number], ParseFailure> {
  const match = NUMBER_PATTERN.exec(input.slice(pos));
  if (!match) {
    return { ok: false, error: { position: pos, reason: "expected a number" } };
  }
  return { ok: true, value: [Number(match[0]), pos + match[0].length] };
}

type Scope = Map<string, number>;

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*/;

function parseIdentifier(
  input: string,
  pos: number,
): Result<[string, number], ParseFailure> {
  const match = IDENTIFIER_PATTERN.exec(input.slice(pos));
  if (!match) {
    return {
      ok: false,
      error: { position: pos, reason: "expected an identifier" },
    };
  }
  return { ok: true, value: [match[0], pos + match[0].length] };
}

function parseFactor(
  input: string,
  pos: number,
  scope: Scope,
): Result<[number, number], ParseFailure> {
  pos = skipWhitespace(input, pos);
  if (input[pos] === "-") {
    const inner = parseFactor(input, pos + 1, scope);
    if (!inner.ok) {
      return inner;
    }
    return { ok: true, value: [-inner.value[0], inner.value[1]] };
  }
  if (input[pos] === "(") {
    const inner = parseExpression(input, pos + 1, scope);
    if (!inner.ok) {
      return inner;
    }
    const closePos = skipWhitespace(input, inner.value[1]);
    if (input.charAt(closePos) !== ")") {
      return {
        ok: false,
        error: { position: closePos, reason: "expected ')'" },
      };
    }
    return { ok: true, value: [inner.value[0], closePos + 1] };
  }
  if (input[pos] === "{") {
    return parseBlock(input, pos + 1, scope);
  }
  if (/[A-Za-z_]/.test(input.charAt(pos))) {
    const ident = parseIdentifier(input, pos);
    if (!ident.ok) {
      return ident;
    }
    const value = scope.get(ident.value[0]);
    if (value === undefined) {
      return {
        ok: false,
        error: {
          position: pos,
          reason: `unknown variable '${ident.value[0]}'`,
        },
      };
    }
    return { ok: true, value: [value, ident.value[1]] };
  }
  return parseNumber(input, pos);
}

function parseTerm(
  input: string,
  pos: number,
  scope: Scope,
): Result<[number, number], ParseFailure> {
  const first = parseFactor(input, pos, scope);
  if (!first.ok) {
    return first;
  }
  let [value, next] = first.value;
  for (;;) {
    const opPos = skipWhitespace(input, next);
    if (input.charAt(opPos) !== "*") {
      break;
    }
    const right = parseFactor(input, opPos + 1, scope);
    if (!right.ok) {
      return right;
    }
    value *= right.value[0];
    next = right.value[1];
  }
  return { ok: true, value: [value, next] };
}

function parseExpression(
  input: string,
  pos: number,
  scope: Scope,
): Result<[number, number], ParseFailure> {
  const first = parseTerm(input, pos, scope);
  if (!first.ok) {
    return first;
  }
  let [value, next] = first.value;
  for (;;) {
    const opPos = skipWhitespace(input, next);
    const op = input.charAt(opPos);
    if (op !== "+" && op !== "-") {
      break;
    }
    const right = parseTerm(input, opPos + 1, scope);
    if (!right.ok) {
      return right;
    }
    value = op === "+" ? value + right.value[0] : value - right.value[0];
    next = right.value[1];
  }
  return { ok: true, value: [value, next] };
}

function parseLetStatement(
  input: string,
  pos: number,
  scope: Scope,
  declaredHere: Set<string>,
): Result<number, ParseFailure> {
  let p = skipWhitespace(input, pos + 3);
  const namePos = p;
  const ident = parseIdentifier(input, p);
  if (!ident.ok) {
    return ident;
  }
  const name = ident.value[0];
  if (declaredHere.has(name)) {
    return {
      ok: false,
      error: {
        position: namePos,
        reason: `variable '${name}' is already declared in this block`,
      },
    };
  }
  p = skipWhitespace(input, ident.value[1]);
  if (input.charAt(p) !== "=") {
    return {
      ok: false,
      error: {
        position: p,
        reason: `expected '=' after variable name '${name}'`,
      },
    };
  }
  p = skipWhitespace(input, p + 1);
  const expr = parseExpression(input, p, scope);
  if (!expr.ok) {
    return expr;
  }
  scope.set(name, expr.value[0]);
  declaredHere.add(name);
  p = skipWhitespace(input, expr.value[1]);
  if (input.charAt(p) !== ";") {
    return {
      ok: false,
      error: { position: p, reason: "expected ';' after a 'let' statement" },
    };
  }
  return { ok: true, value: skipWhitespace(input, p + 1) };
}

function isLetKeyword(input: string, pos: number): boolean {
  return (
    input.startsWith("let", pos) && !/[A-Za-z0-9_]/.test(input.charAt(pos + 3))
  );
}

interface StatementListOptions {
  isTerminator: (input: string, pos: number) => boolean;
  emptyError: string;
  trailingError: string;
}

function parseStatementList(
  input: string,
  pos: number,
  scope: Scope,
  declaredHere: Set<string>,
  options: StatementListOptions,
): Result<[number, number], ParseFailure> {
  for (;;) {
    pos = skipWhitespace(input, pos);
    if (options.isTerminator(input, pos)) {
      return {
        ok: false,
        error: { position: pos, reason: options.emptyError },
      };
    }
    if (isLetKeyword(input, pos)) {
      const stmt = parseLetStatement(input, pos, scope, declaredHere);
      if (!stmt.ok) {
        return stmt;
      }
      pos = stmt.value;
      continue;
    }
    const expr = parseExpression(input, pos, scope);
    if (!expr.ok) {
      return expr;
    }
    pos = skipWhitespace(input, expr.value[1]);
    if (input.charAt(pos) === ";") {
      pos = skipWhitespace(input, pos + 1);
      continue;
    }
    if (options.isTerminator(input, pos)) {
      return { ok: true, value: [expr.value[0], pos] };
    }
    return {
      ok: false,
      error: { position: pos, reason: options.trailingError },
    };
  }
}

function parseBlock(
  input: string,
  pos: number,
  scope: Scope,
): Result<[number, number], ParseFailure> {
  const child = new Map(scope);
  const declaredHere = new Set<string>();
  const parsed = parseStatementList(input, pos, child, declaredHere, {
    isTerminator: (i, p) => i.charAt(p) === "}",
    emptyError: "expected an expression in block",
    trailingError: "expected ';' or '}' after expression",
  });
  if (!parsed.ok) {
    return parsed;
  }
  const [value, termPos] = parsed.value;
  return { ok: true, value: [value, termPos + 1] };
}

function parseProgram(
  input: string,
  pos: number,
  scope: Scope,
): Result<[number, number], ParseFailure> {
  const declaredHere = new Set<string>();
  return parseStatementList(input, pos, scope, declaredHere, {
    isTerminator: (i, p) => p >= i.length,
    emptyError: "expected an expression",
    trailingError: "expected ';' after expression",
  });
}

function parseError(
  input: string,
  position: number,
  reason: string,
): EvaluateError {
  return {
    kind: EvaluateErrorKind.ParseError,
    input,
    position,
    message:
      `evaluate() failed to parse ${JSON.stringify(input)}: ${reason} at position ${position}. ` +
      'Provide an expression of numeric literals combined with "+", "-", and "*" (e.g. "1 + 2"), optionally grouped with parentheses or braces (e.g. "(1 + 2) * 3"), with "let" bindings at the top level or inside braces (e.g. "let x = 1 + 2; x"); a name may not be redeclared within the same block, though nested blocks may shadow it.',
  };
}

const MAX_PAREN_DEPTH = 1000;

function parenDepthError(input: string): ParseFailure | null {
  let depth = 0;
  let maxDepth = 0;
  let maxDepthPos = 0;
  for (let i = 0; i < input.length; i++) {
    if (input[i] === "(" || input[i] === "{") {
      depth++;
      if (depth > maxDepth) {
        maxDepth = depth;
        maxDepthPos = i;
      }
    } else if (input[i] === ")" || input[i] === "}") {
      depth--;
    }
  }
  if (maxDepth <= MAX_PAREN_DEPTH) {
    return null;
  }
  return { position: maxDepthPos, reason: "expression nesting too deep" };
}

export function evaluate(input: string): Result<number, EvaluateError> {
  const start = skipWhitespace(input, 0);
  if (start === input.length) {
    return { ok: true, value: 0 };
  }
  const tooDeep = parenDepthError(input);
  if (tooDeep) {
    return {
      ok: false,
      error: parseError(input, tooDeep.position, tooDeep.reason),
    };
  }
  const parsed = parseProgram(input, start, new Map());
  if (!parsed.ok) {
    return {
      ok: false,
      error: parseError(input, parsed.error.position, parsed.error.reason),
    };
  }
  const [value, end] = parsed.value;
  const rest = skipWhitespace(input, end);
  if (rest < input.length) {
    return {
      ok: false,
      error: parseError(
        input,
        rest,
        `unexpected character ${JSON.stringify(input[rest])}`,
      ),
    };
  }
  return { ok: true, value };
}
