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

type ArrayBinding = {
  values: number[];
  elementType: string;
  length: number;
  mutable: boolean;
};

type Binding = Record<
  string,
  { value: number; type: string; mutable: boolean } | ArrayBinding
>;

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
  function lookup(name: string) {
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

    // Array literal [...] — parse it and handle any indexing.
    if (tok === "[") {
      const arr = parseArrayLiteral();
      return handleIndexing(arr.value, arr.type);
    }

    // Variable reference.
    if (
      tok != null &&
      /^[a-zA-Z_]\w*$/.test(tok) &&
      tok !== "let" &&
      !TUFF_RANGES[tok]
    ) {
      const binding = lookup(tok);
      if (!binding) throw new Error(`Undefined variable: ${tok}`);
      s.pos++;

      // If it's an array binding, pass the ArrayBinding for indexing support.
      if ("values" in binding) {
        return handleIndexing(
          binding as ArrayBinding,
          `[${(binding as ArrayBinding).elementType}; ${(binding as ArrayBinding).length}]`,
        );
      }

      // Scalar variable reference — check no [index] follows (shouldn't happen for scalars).
      const scalar = binding as {
        value: number;
        type: string;
        mutable?: boolean;
      };
      if (s.pos < tokens.length && tokens[s.pos] === "[") {
        throw new Error(`Cannot index non-array type: ${scalar.type}`);
      }
      return { value: scalar.value, type: scalar.type };
    }

    // Must be a literal.
    const result = parseLiteral();
    if (s.pos < tokens.length && tokens[s.pos] === "[") {
      throw new Error(`Cannot index literal`);
    }
    return result;
  }

  function handleIndexing(
    rawValue: number | ArrayBinding,
    typeStr: string,
  ): { value: number; type: string } {
    while (s.pos < tokens.length && tokens[s.pos] === "[") {
      s.pos++; // consume '['

      const indexExpr = parseIndexExpression();

      if (tokens[s.pos] !== "]")
        throw new Error("Expected ']' after array index");
      s.pos++; // consume ']'

      const arrInfo = parseArrayType(typeStr);
      if (!arrInfo) {
        throw new Error(`Cannot index non-array type: ${typeStr}`);
      }

      let elementValue: number;
      if (typeof rawValue === "object" && "values" in rawValue) {
        const idx = Number(indexExpr.value);
        if (idx < 0 || idx >= rawValue.length)
          throw new Error(`Array index ${idx} out of bounds`);
        elementValue = rawValue.values[idx]!;
      } else {
        throw new Error(`Cannot index type: ${typeStr}`);
      }

      return { value: elementValue, type: arrInfo.elementType };
    }

    // No indexing brackets — just return the scalar value.
    if (typeof rawValue === "number") {
      return { value: rawValue, type: typeStr };
    }
    throw new Error(`Array values cannot be used directly; use indexing`);
  }

  function parseIndexExpression(): { value: number; type: string } {
    // Index expressions can be plain integers without type suffixes.
    const token = tokens[s.pos]!;
    s.pos++;

    // Try as a typed literal first (e.g., "0U8").
    const match = token.match(/^(-?\d+)([UI]\d+)$/);
    if (match) {
      return { value: parseTuffLiteral(match[1]!, match[2]!), type: match[2]! };
    }

    // Try as a plain integer.
    const intMatch = token.match(/^(-?\d+)$/);
    if (intMatch && intMatch[1]) {
      return { value: parseInt(intMatch[1]), type: "U8" };
    }

    throw new Error(`Invalid index expression: ${token}`);
    throw new Error(`Invalid index expression: ${token}`);
  }

  function parseArrayLiteral(): { value: ArrayBinding; type: string } {
    s.pos++; // consume '['

    const elements: number[] = [];
    let elementType: string | undefined;

    while (s.pos < tokens.length && tokens[s.pos] !== "]") {
      if (elements.length > 0 && tokens[s.pos] === ",") {
        s.pos++; // consume ','
      }

      const elem = parseTerm();
      if (!TUFF_RANGES[elem.type])
        throw new Error(`Invalid element type: ${elem.type}`);

      if (elementType) {
        if (elem.type !== elementType)
          throw new Error(
            `Mixed types in array literal: expected ${elementType}, got ${elem.type}`,
          );
      } else {
        elementType = elem.type;
      }

      elements.push(elem.value);
    }

    if (!elementType) throw new Error("Empty array literal");
    if (tokens[s.pos] !== "]")
      throw new Error("Expected ']' to close array literal");
    s.pos++; // consume ']'

    return {
      value: {
        values: elements,
        elementType,
        length: elements.length,
        mutable: false,
      },
      type: `[${elementType}; ${elements.length}]`,
    };
  }

  function parseTerm(): { value: number; type: string } {
    const left = parseFactor();
    while (
      s.pos < tokens.length &&
      (tokens[s.pos] === "*" || tokens[s.pos] === "/")
    ) {
      const op = tokens[s.pos];
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
    if (!match) throw new Error(`Invalid Tuff literal: ${token}`);

    const rawValueStr = match[1]!;
    const typeSuffix = match[2]!;
    return {
      value: parseTuffLiteral(rawValueStr, typeSuffix),
      type: typeSuffix,
    };
  }

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
        throw new Error(`Invalid operator: ${op}`);
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

  function parseBlockBody(): { value: number; type: string } {
    while (s.pos < tokens.length) {
      if (tokens[s.pos] === "let") {
        parseLetDeclaration();
      } else if (isAssignment()) {
        parseAssignment();
      } else {
        break;
      }
    }

    return parseAdditiveExpr(["}"]);
  }

  function validateExplicitType(t: string, v: { value: number; type: string }) {
    if (getBitWidth(t) < getBitWidth(v.type)) {
      throw new Error(`Cannot narrow ${v.type} to ${t}: potential data loss`);
    }
    const r = TUFF_RANGES[t]!;
    if (BigInt(v.value) < r.min || BigInt(v.value) > r.max) {
      throw new Error(
        `Value ${v.value} out of range for ${t}: ${r.min} to ${r.max}`,
      );
    }
  }

  function readVariableName(): string {
    const name = tokens[s.pos]!;
    if (!/^[a-zA-Z_]\w*$/.test(name))
      throw new Error(`Invalid variable name: ${name}`);
    s.pos++;
    return name;
  }
  // Parse the RHS of a let declaration. Returns either scalar or array binding data.
  function parseLetRhs(): {
    value?: number;
    type: string;
    values?: number[];
    elementType?: string;
    length?: number;
  } {
    const tok = tokens[s.pos];

    if (tok === "[") {
      // Array literal — parse directly without going through handleIndexing.
      const arrResult = parseArrayLiteral();
      return {
        value: undefined,
        type: arrResult.type,
        values: arrResult.value.values,
        elementType: arrResult.value.elementType,
        length: arrResult.value.length,
      };
    }

    // Scalar expression — use normal parsing path but skip indexing check.
    const result = parseTerm();
    return { value: result.value, type: result.type };
  }

  // Parse explicit type annotation after ':'. Returns the type string or undefined if no ':' present.
  function parseExplicitType(): string | undefined {
    if (tokens[s.pos] !== ":") return undefined;
    s.pos++; // consume ':'

    // Check for array type [ElementType; length].
    if (tokens[s.pos] === "[") {
      s.pos++; // consume '['
      const elementType = tokens[s.pos];
      if (!elementType)
        throw new Error("Invalid array type: missing element type");
      s.pos++; // consume element type (e.g., "U8")
      if (tokens[s.pos] !== ";") throw new Error(`Expected ';' in array type`);
      s.pos++; // consume ';'
      const lengthStr = tokens[s.pos];
      if (!lengthStr) throw new Error("Invalid array type: missing length");
      s.pos++; // consume length number
      if (tokens[s.pos] !== "]")
        throw new Error("Expected ']' to close array type");
      s.pos++; // consume ']'
      return `[${elementType}; ${lengthStr}]`;
    }

    // Scalar type.
    const scalarType = tokens[s.pos];
    if (!scalarType) throw new Error("Missing type annotation");
    if (!TUFF_RANGES[scalarType])
      throw new Error(`Unsupported Tuff type: ${scalarType}`);
    s.pos++; // consume the type token
    return scalarType;
  }

  // Parse a `let [mut] name [: Type] = expr ;` declaration.
  function parseLetDeclaration(): void {
    s.pos++; // consume 'let'

    const mutable = tokens[s.pos] === "mut";
    if (mutable) s.pos++; // consume optional 'mut'
    const name = readVariableName();

    const explicitType = parseExplicitType();

    if (!explicitType && tokens[s.pos] !== "=") {
      throw new Error(`Expected ':' or '=' after variable name '${name}'`);
    }

    s.pos++; // consume '=' (or skip when no type was given and '=' is next)
    const parsedValue = parseLetRhs();

    if (explicitType && !isArrayType(explicitType)) {
      validateExplicitType(
        explicitType,
        parsedValue as { value: number; type: string },
      );
    } else if (
      explicitType &&
      isArrayType(explicitType) &&
      isArrayType(parsedValue.type)
    ) {
      const expectedArr = parseArrayType(explicitType)!;
      const actualArr = parseArrayType(parsedValue.type)!;
      if (expectedArr.length !== actualArr.length) {
        throw new Error(
          `Array length mismatch: expected ${expectedArr.length}, got ${actualArr.length}`,
        );
      }
    }

    storeBinding(name, explicitType ?? parsedValue.type, parsedValue, mutable);

    if (s.pos < tokens.length && tokens[s.pos] === ";") s.pos++; // consume ';'
  }

  function storeBinding(
    name: string,
    finalType: string,
    parsedValue: {
      value?: number;
      type: string;
      values?: number[];
      elementType?: string;
      length?: number;
    },
    mutable: boolean,
  ): void {
    const topScope = sc[sc.length - 1];
    if (!topScope) throw new Error("Internal error: empty scope stack");
    if (name in topScope) {
      throw new Error(`Duplicate variable declaration: ${name}`);
    }

    // Store either scalar or array binding.
    if (isArrayType(finalType)) {
      topScope[name] = {
        values: parsedValue.values!,
        elementType: parsedValue.elementType!,
        length: parsedValue.length!,
        mutable,
      };
    } else {
      topScope[name] = {
        value: parsedValue.value!,
        type: finalType,
        mutable,
      };
    }
  }

  function parseAssignment(): void {
    const name = readVariableName();

    if (tokens[s.pos] !== "=")
      throw new Error(`Expected '=' after variable name '${name}'`);
    s.pos++; // consume '='

    const value = parseTerm();

    const binding = lookup(name);
    if (!binding) throw new Error(`Undefined variable: ${name}`);
    const scalarBinding = binding as {
      value: number;
      type: string;
      mutable?: boolean;
    };
    if (!scalarBinding.mutable) {
      throw new Error(`Cannot reassign immutable variable '${name}'`);
    }

    // Prevent narrowing on assignment too.
    if (getBitWidth(value.type) > getBitWidth(scalarBinding.type)) {
      throw new Error(
        `Cannot narrow ${value.type} to ${scalarBinding.type}: potential data loss`,
      );
    }

    const topScope = sc[sc.length - 1];
    if (!topScope || !(name in topScope))
      throw new Error(`Variable '${name}' not found in current scope`);
    (topScope[name] as { value: number }).value = value.value;

    if (s.pos < tokens.length && tokens[s.pos] === ";") s.pos++; // consume ';'
  }

  function isAssignment(): boolean {
    const tok = tokens[s.pos];
    return (
      s.pos + 1 < tokens.length &&
      tok != null &&
      /^[a-zA-Z_]\w*$/.test(tok) &&
      tok !== "let" &&
      tok !== "mut" &&
      !TUFF_RANGES[tok] &&
      tokens[s.pos + 1] === "="
    );
  }

  // Consume leading statements (let-declarations and assignments).
  while (s.pos < tokens.length) {
    if (tokens[s.pos] === "let") {
      parseLetDeclaration();
    } else if (isAssignment()) {
      parseAssignment();
    } else {
      break;
    }
  }

  if (s.pos >= tokens.length) return { value: 0, type: "U8" };

  const result = parseAdditiveExpr([")", "}"]);
  return result;
}

function tokenize(input: string): Array<string> {
  const tokens = input.match(/(-?\d+[UI]\d+|[+\-*/(){}=:;,|[\]]|let|mut|\w+)/g);
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

// Check if a type string is an array type like "[U8; 3]".
function isArrayType(t: string): boolean {
  return t.startsWith("[") && t.includes(";");
}

// Parse the element type and length from an array type string.
function parseArrayType(
  t: string,
): { elementType: string; length: number } | undefined {
  const match = t.match(/^\[([UI]\d+|I\d+);\s*(\d+)\]$/);
  if (!match) return undefined;
  return { elementType: match[1]!, length: parseInt(match[2]!) };
}
