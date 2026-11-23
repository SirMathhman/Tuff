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

type Token = NumberToken | OperatorToken;

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
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source.charAt(index);
    if (isDigit(char)) {
      let end = index;
      while (end < source.length && isDigit(source.charAt(end))) {
        end++;
      }
      tokens.push({
        kind: "number",
        value: Number(source.slice(index, end)),
        pos: index,
      });
      index = end;
    } else if (char === "+" || char === "-" || char === "*") {
      tokens.push({ kind: "operator", symbol: char, pos: index });
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

function signOf(token: Token | undefined): 1 | -1 | undefined {
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

// Reported when a number is required but the token at that place is an
// operator, or the source ends. `end` is the source length.
function missingNumber<T>(token: Token | undefined, end: number): Result<T> {
  if (token === undefined) {
    return err({
      what: "Missing number",
      where: end,
      why: "The expression ends where a number is required",
      fix: "Add a number after the last operator, or delete that operator",
    });
  }
  return err({
    what: "Missing number",
    where: token.pos,
    why:
      token.kind === "operator"
        ? `Found "${token.symbol}" where a number is required`
        : "A number is required here",
    fix: "Put a number before this operator, or remove the operator before it",
  });
}

// Reported when two numbers appear with no operator between them.
function missingOperator<T>(token: Token | undefined, end: number): Result<T> {
  return err({
    what: "Missing operator",
    where: token?.pos ?? end,
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
  if (token?.kind !== "number") {
    return missingNumber(token, end);
  }
  return ok({ value: token.value, next: index + 1 });
}

function parseTerm(
  tokens: Token[],
  index: number,
  sign: 1 | -1,
  end: number,
): Result<Parsed> {
  const first = parseNumber(tokens, index, end);
  if (!first.ok) {
    return first;
  }
  let value = sign * first.value.value;
  let next = first.value.next;
  let token = tokens[next];
  while (token?.kind === "operator" && token.symbol === "*") {
    const factor = parseNumber(tokens, next + 1, end);
    if (!factor.ok) {
      return factor;
    }
    value *= factor.value.value;
    next = factor.value.next;
    token = tokens[next];
  }
  return ok({ value, next });
}

export function interpretTuff(tuffSource: string): Result<number> {
  // Grammar: an optional leading sign, then terms joined by "+" or "-".
  // A term is numbers joined by "*". Signs appear only at the start of the
  // expression or directly after "+" or "-". "*" binds tighter than "+" and "-".
  const tokenized = tokenize(tuffSource);
  if (!tokenized.ok) {
    return tokenized;
  }
  const tokens = tokenized.value;
  const end = tuffSource.length;
  if (tokens.length === 0) {
    return ok(0);
  }

  const leadingSign = signOf(tokens[0]);
  const first = parseTerm(
    tokens,
    leadingSign === undefined ? 0 : 1,
    leadingSign ?? 1,
    end,
  );
  if (!first.ok) {
    return first;
  }
  let sum = first.value.value;
  let index = first.value.next;

  while (index < tokens.length) {
    const token = tokens[index];
    const sign = signOf(token);
    if (sign === undefined) {
      return missingOperator(token, end);
    }
    const term = parseTerm(tokens, index + 1, sign, end);
    if (!term.ok) {
      return term;
    }
    sum += term.value.value;
    index = term.value.next;
  }

  return ok(sum);
}
