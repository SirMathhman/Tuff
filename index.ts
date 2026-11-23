export interface OkResult<T> {
  ok: true;
  value: T;
}

export interface ErrResult {
  ok: false;
  error: string;
}

export type Result<T> = OkResult<T> | ErrResult;

enum OperatorSymbol {
  Plus = "+",
  Minus = "-",
  Times = "*",
}

interface NumberToken {
  kind: "number";
  value: number;
  pos: number;
}

interface OperatorToken {
  kind: "operator";
  symbol: OperatorSymbol;
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

function err<T>(error: string): Result<T> {
  return { ok: false, error };
}

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

function operatorFor(char: string): OperatorSymbol | undefined {
  if (char === "+") {
    return OperatorSymbol.Plus;
  }
  if (char === "-") {
    return OperatorSymbol.Minus;
  }
  if (char === "*") {
    return OperatorSymbol.Times;
  }
  return undefined;
}

function tokenize(source: string): Result<Token[]> {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source.charAt(index);
    const symbol = operatorFor(char);
    if (isDigit(char)) {
      let end = index;
      while (end < source.length && isDigit(source.charAt(end))) {
        end++;
      }
      tokens.push({ kind: "number", value: Number(source.slice(index, end)), pos: index });
      index = end;
    } else if (symbol !== undefined) {
      tokens.push({ kind: "operator", symbol, pos: index });
      index++;
    } else if (char.trim() === "") {
      index++;
    } else {
      return err(`Unexpected character "${char}" at position ${index}`);
    }
  }
  return ok(tokens);
}

function signOf(token: Token | undefined): 1 | -1 | undefined {
  if (token?.kind !== "operator") {
    return undefined;
  }
  if (token.symbol === OperatorSymbol.Plus) {
    return 1;
  }
  if (token.symbol === OperatorSymbol.Minus) {
    return -1;
  }
  return undefined;
}

function expectedError<T>(what: string, tokens: Token[], index: number): Result<T> {
  const token = tokens[index];
  const where = token === undefined ? "end of input" : `position ${token.pos}`;
  return err(`Expected ${what} at ${where}`);
}

function parseNumber(tokens: Token[], index: number): Result<Parsed> {
  const token = tokens[index];
  if (token?.kind !== "number") {
    return expectedError("a number", tokens, index);
  }
  return ok({ value: token.value, next: index + 1 });
}

function parseTerm(tokens: Token[], index: number, sign: 1 | -1): Result<Parsed> {
  const first = parseNumber(tokens, index);
  if (!first.ok) {
    return first;
  }
  let value = sign * first.value.value;
  let next = first.value.next;
  let token = tokens[next];
  while (token?.kind === "operator" && token.symbol === OperatorSymbol.Times) {
    const factor = parseNumber(tokens, next + 1);
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
  if (tokens.length === 0) {
    return ok(0);
  }

  const leadingSign = signOf(tokens[0]);
  const first = parseTerm(tokens, leadingSign === undefined ? 0 : 1, leadingSign ?? 1);
  if (!first.ok) {
    return first;
  }
  let sum = first.value.value;
  let index = first.value.next;

  while (index < tokens.length) {
    const sign = signOf(tokens[index]);
    if (sign === undefined) {
      return expectedError("an operator", tokens, index);
    }
    const term = parseTerm(tokens, index + 1, sign);
    if (!term.ok) {
      return term;
    }
    sum += term.value.value;
    index = term.value.next;
  }

  return ok(sum);
}
