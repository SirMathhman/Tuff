export interface OkResult<T> {
  ok: true;
  value: T;
}

export interface TuffError {
  // What went wrong, in a few words.
  what: string;
  // Zero-based character offset in the source where the problem is.
  where: number;
  // The rule that was broken.
  why: string;
  // What the caller should change to make the source valid.
  fix: string;
}

export interface ErrResult {
  ok: false;
  error: TuffError;
}

export type Result<T> = OkResult<T> | ErrResult;

interface NumberToken {
  kind: "number";
  value: number;
  pos: number;
}

interface OperatorToken {
  kind: "operator";
  symbol: "+" | "-" | "*";
  pos: number;
}

interface OpenParenToken {
  kind: "open";
  pos: number;
}

interface CloseParenToken {
  kind: "close";
  pos: number;
}

type Token = NumberToken | OperatorToken | OpenParenToken | CloseParenToken;

interface Parsed {
  value: number;
  next: number;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function err<T>(error: TuffError): Result<T> {
  return { ok: false, error };
}

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

function tokenize(source: string): Result<Token[]> {
  let tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source.charAt(index);
    if (isDigit(char)) {
      let end = index;
      while (end < source.length && isDigit(source.charAt(end))) {
        end++;
      }
      tokens = [
        ...tokens,
        {
          kind: "number",
          value: Number(source.slice(index, end)),
          pos: index,
        },
      ];
      index = end;
    } else if (char === "+" || char === "-" || char === "*") {
      tokens = [...tokens, { kind: "operator", symbol: char, pos: index }];
      index++;
    } else if (char === "(") {
      tokens = [...tokens, { kind: "open", pos: index }];
      index++;
    } else if (char === ")") {
      tokens = [...tokens, { kind: "close", pos: index }];
      index++;
    } else if (char.trim() === "") {
      index++;
    } else {
      return err({
        what: "Unexpected character",
        where: index,
        why: `"${char}" is not a digit, an operator (+, -, *), or whitespace`,
        fix: `Remove "${char}" or replace it with a number or operator`,
      });
    }
  }
  return ok(tokens);
}

function signAt(tokens: Token[], index: number): 1 | -1 | undefined {
  const token = tokens[index];
  if (token?.kind !== "operator") {
    return undefined;
  }
  if (token.symbol === "+") {
    return 1;
  }
  if (token.symbol === "-") {
    return -1;
  }
  return undefined;
}

// Reported when a number is required but the source ends. `end` is the source
// length.
function missingNumberAtEnd<T>(end: number): Result<T> {
  return err({
    what: "Missing number",
    where: end,
    why: "The expression ends where a number is required",
    fix: "Add a number after the last operator, or delete that operator",
  });
}

// Reported when a number is required but the token at that place is an
// operator or a parenthesis.
function missingNumber<T>(token: Token): Result<T> {
  if (token.kind === "close") {
    return err({
      what: "Missing number",
      where: token.pos,
      why: 'Found ")" where a number is required',
      fix: "Put a number inside the parentheses, or delete the parentheses",
    });
  }
  return err({
    what: "Missing number",
    where: token.pos,
    why:
      token.kind === "operator"
        ? `Found "${token.symbol}" where a number is required`
        : 'Found "(" where a number is required',
    fix: "Put a number before this operator, or remove the operator before it",
  });
}

// Reported when two numbers (or a number and a group) appear with no operator
// between them.
function missingOperator<T>(token: Token): Result<T> {
  return err({
    what: "Missing operator",
    where: token.pos,
    why: "Two numbers appear next to each other with no operator between them",
    fix: "Insert +, -, or * between the numbers, or delete one of them",
  });
}

function parseNumber(
  tokens: Token[],
  index: number,
  end: number,
): Result<Parsed> {
  const token = tokens[index];
  if (token === undefined) {
    return missingNumberAtEnd(end);
  }
  if (token.kind !== "number") {
    return missingNumber(token);
  }
  return ok({ value: token.value, next: index + 1 });
}

// A factor is a number or a parenthesized expression. Signs are not allowed
// directly before a factor; a sign inside parentheses belongs to that
// expression.
function parseFactor(tokens: Token[], index: number, end: number): Result<Parsed> {
  const token = tokens[index];
  if (token?.kind === "open") {
    return parseGroup(tokens, index, end);
  }
  return parseNumber(tokens, index, end);
}

// Parses "(" expression ")". `index` points at the "(".
function parseGroup(tokens: Token[], index: number, end: number): Result<Parsed> {
  const open = tokens[index];
  const inner = parseExpression(tokens, index + 1, end);
  if (!inner.ok) {
    return inner;
  }
  const next = inner.value.next;
  const token = tokens[next];
  if (token === undefined) {
    return err({
      what: "Unmatched parenthesis",
      where: open?.pos ?? end,
      why: 'The "(" at this position has no matching ")"',
      fix: 'Add a ")" after its expression, or delete this "("',
    });
  }
  if (token.kind !== "close") {
    return missingOperator(token);
  }
  return ok({ value: inner.value.value, next: next + 1 });
}

function parseTerm(
  tokens: Token[],
  index: number,
  sign: 1 | -1,
  end: number,
): Result<Parsed> {
  const first = parseFactor(tokens, index, end);
  if (!first.ok) {
    return first;
  }
  let value = sign * first.value.value;
  let next = first.value.next;
  let token = tokens[next];
  while (token?.kind === "operator" && token.symbol === "*") {
    const factor = parseFactor(tokens, next + 1, end);
    if (!factor.ok) {
      return factor;
    }
    value *= factor.value.value;
    next = factor.value.next;
    token = tokens[next];
  }
  return ok({ value, next });
}

// Parses an optional leading sign, then terms joined by "+" or "-". Stops
// before the first token that is not "+" or "-"; the caller decides whether
// that token is valid there.
function parseExpression(tokens: Token[], index: number, end: number): Result<Parsed> {
  const leadingSign = signAt(tokens, index);
  const first = parseTerm(
    tokens,
    leadingSign === undefined ? index : index + 1,
    leadingSign ?? 1,
    end,
  );
  if (!first.ok) {
    return first;
  }
  let sum = first.value.value;
  let next = first.value.next;

  let sign = signAt(tokens, next);
  while (sign !== undefined) {
    const term = parseTerm(tokens, next + 1, sign, end);
    if (!term.ok) {
      return term;
    }
    sum += term.value.value;
    next = term.value.next;
    sign = signAt(tokens, next);
  }

  return ok({ value: sum, next });
}

export function interpretTuff(tuffSource: string): Result<number> {
  // Grammar:
  //   expression = [sign] term { ("+" | "-") term }
  //   term       = factor { "*" factor }
  //   factor     = number | "(" expression ")"
  // "*" binds tighter than "+" and "-". Parentheses group an expression.
  const tokenized = tokenize(tuffSource);
  if (!tokenized.ok) {
    return tokenized;
  }
  const tokens = tokenized.value;
  const end = tuffSource.length;
  if (tokens.length === 0) {
    return ok(0);
  }

  const expression = parseExpression(tokens, 0, end);
  if (!expression.ok) {
    return expression;
  }
  const stop = tokens[expression.value.next];
  if (stop === undefined) {
    return ok(expression.value.value);
  }
  if (stop.kind === "close") {
    return err({
      what: "Unmatched parenthesis",
      where: stop.pos,
      why: 'This ")" has no matching "("',
      fix: 'Add a "(" before its expression, or delete this ")"',
    });
  }
  return missingOperator(stop);
}
