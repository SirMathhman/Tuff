const TUFF_RANGES: Record<string, { min: bigint; max: bigint }> = {
  U8: { min: BigInt(0), max: BigInt(255) },
  U16: { min: BigInt(0), max: BigInt(65535) },
  U32: { min: BigInt(0), max: BigInt(4294967295) },
  U64: { min: BigInt(0), max: BigInt("18446744073709551615") },
  I8: { min: BigInt(-128), max: BigInt(127) },
  I16: { min: BigInt(-32768), max: BigInt(32767) },
  I32: { min: BigInt(-2147483648), max: BigInt(2147483647) },
  I64: {
    min: BigInt("-9223372036854775808"),
    max: BigInt("9223372036854775807"),
  },
};

export function interpretTuff(input: string): number {
  if (input === "") return 0;

  const tokens = tokenize(input);
  const result = parseExpr(tokens, input);

  const resultRange = TUFF_RANGES[result.type];
  if (!resultRange) throw new Error(`Unsupported Tuff type: ${result.type}`);

  if (
    result.value < Number(resultRange.min) ||
    result.value > Number(resultRange.max)
  ) {
    throw new Error(
      `Result ${result.value} overflows for type ${result.type}: must be between ${resultRange.min} and ${resultRange.max}`,
    );
  }

  return result.value;
}

function parseExpr(
  tokens: Array<string>,
  input: string,
): { value: number; type: string };
function parseExpr(
  tokens: Array<string>,
  input: string,
  state: { pos: number },
): { value: number; type: string };

// eslint-disable-next-line max-lines-per-function -- recursive descent parser needs nested functions
function parseExpr(
  tokens: Array<string>,
  input: string,
  state?: { pos: number },
): { value: number; type: string } {
  const s = state ?? { pos: 0 };

  function parseFactor(): { value: number; type: string } {
    if (tokens[s.pos] === "(") {
      // Parenthesized sub-expression — override precedence by recursing.
      s.pos++; // consume '('
      const result = parseExpr(tokens, input, s);
      if (s.pos >= tokens.length || tokens[s.pos] !== ")") {
        throw new Error(`Invalid Tuff value: ${input}`);
      }
      s.pos++; // consume ')'
      return result;
    }

    return parseLiteral();
  }

  function parseTerm(): { value: number; type: string } {
    const left = parseFactor();
    while (s.pos < tokens.length && (tokens[s.pos] === "*" || tokens[s.pos] === "/")) {
      const op = tokens[s.pos]; // save operator before consuming it
      s.pos++;
      const right = parseFactor();
      if (getBitWidth(right.type) > getBitWidth(left.type)) {
        left.type = right.type;
      }
      left.value = op === "*" ? left.value * right.value : Math.floor(left.value / right.value);
    }
    return left;
  }

  function parseLiteral(): { value: number; type: string } {
    const token = tokens[s.pos]!;
    s.pos++;
    const match = token.match(/^(-?\d+)([UI]\d+)$/);
    if (!match) throw new Error(`Invalid Tuff value: ${input}`);

    const rawValueStr = match[1]!;
    const typeSuffix = match[2]!;

    parseTuffLiteral(rawValueStr.replace(/^-/, ""), typeSuffix);

    let effectiveValue: number;
    if (rawValueStr.startsWith("-")) {
      effectiveValue = -parseTuffLiteral(rawValueStr.slice(1), typeSuffix);
    } else {
      effectiveValue = parseTuffLiteral(rawValueStr, typeSuffix);
    }

    return { value: effectiveValue, type: typeSuffix };
  }

  // eslint-disable-next-line prefer-const -- mutated in place, not reassigned
  let result = parseTerm();
  while (s.pos < tokens.length && tokens[s.pos] !== ")") {
    const op = tokens[s.pos]!;
    s.pos++;
    if (op !== "+" && op !== "-")
      throw new Error(`Invalid Tuff value: ${input}`);

    const term = parseTerm();
    const widestType =
      getBitWidth(term.type) > getBitWidth(result.type) ? term.type : result.type;
    result.value += op === "-" ? -term.value : term.value;
    result.type = widestType;
  }

  return result;
}

function tokenize(input: string): Array<string> {
const tokens = input.match(/(-?\d+[UI]\d+|[+\-*/()])/g);

  if (!tokens || tokens.length === 0)
    throw new Error(`Invalid Tuff value: ${input}`);
  return tokens;
}

function getBitWidth(typeSuffix: string): number {
  const num = parseInt(typeSuffix.slice(1));
  if (isNaN(num)) throw new Error(`Unsupported Tuff type: ${typeSuffix}`);
  return num;
}

function parseTuffLiteral(valueStr: string, typeSuffix: string): number {
  const range = TUFF_RANGES[typeSuffix];
  if (!range) throw new Error(`Unsupported Tuff type: ${typeSuffix}`);

  const bigValue = BigInt(valueStr);
  if (bigValue < range.min || bigValue > range.max) {
    throw new Error(
      `Value ${valueStr} out of range for ${typeSuffix}: ${range.min} to ${range.max}`,
    );
  }

  return Number(bigValue);
}
