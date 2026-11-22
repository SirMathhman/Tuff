type Token =
  | { kind: "number"; value: number; pos: number }
  | { kind: "operator"; symbol: "+" | "-" | "*"; pos: number };

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source.charAt(index);
    if (isDigit(char)) {
      let end = index;
      while (end < source.length && isDigit(source.charAt(end))) {
        end++;
      }
      tokens.push({ kind: "number", value: Number(source.slice(index, end)), pos: index });
      index = end;
    } else if (char === "+" || char === "-" || char === "*") {
      tokens.push({ kind: "operator", symbol: char, pos: index });
      index++;
    } else if (char.trim() === "") {
      index++;
    } else {
      throw new Error(`Unexpected character "${char}" at position ${index}`);
    }
  }
  return tokens;
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

export function interpretTuff(tuffSource: string): number {
  // Grammar: an optional leading sign, then terms joined by "+" or "-".
  // A term is numbers joined by "*". Signs appear only at the start of the
  // expression or directly after "+" or "-". "*" binds tighter than "+" and "-".
  const tokens = tokenize(tuffSource);
  if (tokens.length === 0) {
    return 0;
  }

  let index = 0;

  function unexpected(expected: string): never {
    const token = tokens[index];
    const where = token === undefined ? "end of input" : `position ${token.pos}`;
    throw new Error(`Expected ${expected} at ${where}`);
  }

  function expectNumber(): number {
    const token = tokens[index];
    if (token?.kind !== "number") {
      return unexpected("a number");
    }
    index++;
    return token.value;
  }

  function parseTerm(sign: 1 | -1): number {
    let value = sign * expectNumber();
    for (
      let token = tokens[index];
      token?.kind === "operator" && token.symbol === "*";
      token = tokens[index]
    ) {
      index++;
      value *= expectNumber();
    }
    return value;
  }

  const leadingSign = signOf(tokens[0]);
  if (leadingSign !== undefined) {
    index = 1;
  }
  let sum = parseTerm(leadingSign ?? 1);

  while (index < tokens.length) {
    const sign = signOf(tokens[index]);
    if (sign === undefined) {
      return unexpected("an operator");
    }
    index++;
    sum += parseTerm(sign);
  }

  return sum;
}
