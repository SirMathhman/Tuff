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

type Binding = Record<string, { value: number; type: string }>;

export function interpretTuff(input: string): number {
  if (input === "") return 0;

  const tokens = tokenize(input);
  // Start with an empty binding scope stack.
  const result = parseExpr(tokens, input, [{}]);

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
  scopes?: Binding[],
): { value: number; type: string };

function parseExpr(
  tokens: Array<string>,
  input: string,
  scopes?: Binding[],
): { value: number; type: string } {
  const s = { pos: 0 };
  return _parseExpr(tokens, input, s, scopes ?? [{}]);
}

// Internal helper that carries both position state and scope stack through recursion.
// eslint-disable-next-line max-lines-per-function -- recursive descent parser needs nested functions
function _parseExpr(
  tokens: Array<string>,
  input: string,
  s: { pos: number },
  sc: Binding[],
): { value: number; type: string } {
  function lookup(name: string): { value: number; type: string } | undefined {
    for (let i = sc.length - 1; i >= 0; i--) {
      const scope = sc[i];
      if (scope && name in scope) return scope[name]!;
    }
    return undefined;
  }

  function parseFactor(): { value: number; type: string } {
    const tok = tokens[s.pos];

    // Parenthesized or braced sub-expression.
    if (tok === "(" || tok === "{") {
      s.pos++; // consume '(' or '{'
      let result: { value: number; type: string };

      if (tok === "{") {
        // Push a new scope for the block.
        sc.push({});
        result = parseBlockBody();
        sc.pop();
      } else {
        result = _parseExpr(tokens, input, s, sc);
      }

      if (
        s.pos >= tokens.length ||
        (tokens[s.pos] !== ")" && tokens[s.pos] !== "}")
      ) {
        throw new Error(`Invalid Tuff value: ${input}`);
      }
      s.pos++; // consume ')' or '}'
      return result;
    }

    // Variable reference (exclude reserved keywords and type names).
    if (
      tok != null &&
      /^[a-zA-Z_]\w*$/.test(tok) &&
      tok !== "let" &&
      !TUFF_RANGES[tok]
    ) {
      const binding = lookup(tok);
      if (!binding) throw new Error(`Undefined variable: ${tok}`);
      s.pos++;
      return { value: binding.value, type: binding.type };
    }

    return parseLiteral();
  }

  function parseTerm(): { value: number; type: string } {
    const left = parseFactor();
    while (
      s.pos < tokens.length &&
      (tokens[s.pos] === "*" || tokens[s.pos] === "/")
    ) {
      const op = tokens[s.pos]; // save operator before consuming it.
      s.pos++;
      const right = parseFactor();
      if (getBitWidth(right.type) > getBitWidth(left.type)) {
        left.type = right.type;
      }
      left.value =
        op === "*"
          ? left.value * right.value
          : Math.floor(left.value / right.value);
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

  // Shared loop for additive expressions with optional let declarations.
  function parseAdditiveExpr(stopTokens: string[]): {
    value: number;
    type: string;
  } {
    const result = parseTerm();

    while (s.pos < tokens.length && !stopTokens.includes(tokens[s.pos]!)) {
      if (tokens[s.pos] === "let") {
        parseLetDeclaration();
        continue;
      }

      const op = tokens[s.pos]!;
      s.pos++;
      if (op !== "+" && op !== "-") {
        throw new Error(`Invalid Tuff value: ${input}`);
      }

      const term = parseTerm();
      const widestType =
        getBitWidth(term.type) > getBitWidth(result.type)
          ? term.type
          : result.type;
      result.value += op === "-" ? -term.value : term.value;
      result.type = widestType;
    }

    return result;
  }

  // Parse the body of a block: zero or more `let` declarations followed by one final expression.
  function parseBlockBody(): { value: number; type: string } {
    // Consume any leading let-declarations.
    while (s.pos < tokens.length && tokens[s.pos] === "let") {
      parseLetDeclaration();
    }

    return parseAdditiveExpr(["}"]);
  }
  // Parse a `let name : Type = expr ;` or `let name = expr ;` declaration.
  function parseLetDeclaration(): void {
    s.pos++; // consume 'let'
    const name = tokens[s.pos]!;
    if (!/^[a-zA-Z_]\w*$/.test(name))
      throw new Error(`Invalid variable name: ${name}`);
    s.pos++;

    let explicitType: string | undefined;

    if (tokens[s.pos] === ":") {
      // Explicit type annotation present.
      s.pos++;
      explicitType = tokens[s.pos]!;
      if (!TUFF_RANGES[explicitType])
        throw new Error(`Unsupported Tuff type: ${explicitType}`);
      s.pos++;

      if (tokens[s.pos] !== "=") throw new Error(`Expected '=' after type`);
    } else if (tokens[s.pos] === "=") {
      // No explicit type — will infer from assigned value.
    } else {
      throw new Error(`Expected ':' or '=' after variable name '${name}'`);
    }

    s.pos++; // consume '='
    const value = parseTerm();

    if (explicitType) {
      // Prevent narrowing: the explicit type must be at least as wide as the assigned expression's type.
      if (getBitWidth(explicitType) < getBitWidth(value.type)) {
        throw new Error(
          `Cannot narrow ${value.type} to ${explicitType}: potential data loss`,
        );
      }

      // Validate against explicit type range.
      const resultRange = TUFF_RANGES[explicitType]!;
      if (
        BigInt(value.value) < resultRange.min ||
        BigInt(value.value) > resultRange.max
      ) {
        throw new Error(
          `Value ${value.value} out of range for ${explicitType}: ${resultRange.min} to ${resultRange.max}`,
        );
      }
    }

    const topScope = sc[sc.length - 1];
    if (!topScope) throw new Error("Internal error: empty scope stack");

    if (name in topScope) {
      throw new Error(`Duplicate variable declaration: ${name}`);
    }

    topScope[name] = { value: value.value, type: explicitType ?? value.type };

    if (s.pos < tokens.length && tokens[s.pos] === ";") {
      s.pos++; // consume ';'
    }
  }

  while (s.pos < tokens.length && tokens[s.pos] === "let") {
    parseLetDeclaration();
  }

  if (s.pos >= tokens.length) return { value: 0, type: "U8" };

  const result = parseAdditiveExpr([")", "}"]);
  return result;
}

function tokenize(input: string): Array<string> {
  const tokens = input.match(/(-?\d+[UI]\d+|[+\-*/(){}=:;]|let|\w+)/g);
  if (!tokens || tokens.length === 0) {
    throw new Error(`Invalid Tuff value: ${input}`);
  }
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
