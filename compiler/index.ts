interface ParserCtx {
  tokens: string[];
  pos: number;
  scope: Map<string, { value: bigint; type: string; mutable: boolean }>;
}

const MAX_WHILE_ITERATIONS = 1024;

// ── Literal parsing & normalization ───────────────────────────────────

function parseLiteral(literal: string): number | bigint {
  const match = literal.match(/^(-?\d+)([UI])(8|16|32|64)$/);
  if (!match || !match[1] || !match[2] || !match[3])
    throw new Error("Invalid format");

  const valueStr = match[1];
  const typePrefix = match[2]; // "U" or "I"
  const bits = parseInt(match[3], 10);

  let minValue: bigint;
  let maxValue: bigint;

  if (typePrefix === "U") {
    minValue = 0n;
    maxValue = (1n << BigInt(bits)) - 1n;
  } else {
    const signBitShift = BigInt(bits) - 1n;
    minValue = -(1n << signBitShift);
    maxValue = (1n << signBitShift) - 1n;
  }

  const value = BigInt(valueStr);

  if (typePrefix === "U") {
    if (value < minValue) throw new Error("Negative values are not supported");
    if (value > maxValue)
      throw new Error(`Value exceeds maximum for ${typePrefix}${bits}`);
  } else {
    if (value < minValue || value > maxValue)
      throw new Error(`Value out of range for ${typePrefix}${bits}`);
  }

  if (value <= Number.MAX_SAFE_INTEGER && bits !== 64) return Number(value);
  return value;
}

function normalizeResult(val: bigint): number | bigint {
  if (val >= -Number.MAX_SAFE_INTEGER && val <= Number.MAX_SAFE_INTEGER)
    return Number(val);
  return val;
}

// ── Type helpers ──────────────────────────────────────────────────────

function combineTypes(typeA: string, typeB: string): string {
  const matchA = typeA.match(/^([UI])(\d+)$/);
  const matchB = typeB.match(/^([UI])(\d+)$/);
  if (!matchA || !matchB) return "U64";

  const prefixA = matchA[1];
  const bitsA = parseInt(matchA[2]!, 10);
  const prefixB = matchB[1];
  const bitsB = parseInt(matchB[2]!, 10);

  const combinedPrefix = prefixA === "I" || prefixB === "I" ? "I" : "U";
  return `${combinedPrefix}${Math.max(bitsA, bitsB)}`;
}

function inferLiteralType(literal: string): string {
  const match = literal.match(/^(-?\d+)([UI](?:8|16|32|64))$/);
  if (!match) throw new Error("Invalid format");
  return match[2]!;
}

function isAssignable(sourceType: string, targetType: string): boolean {
  const srcIsPointer = sourceType.startsWith("*");
  const tgtIsPointer = targetType.startsWith("*");

  if (srcIsPointer && tgtIsPointer) return sourceType === targetType;

  const srcBase = sourceType.replace(/^\*/, "");
  const tgtBase = targetType.replace(/^\*/, "");

  if (srcBase === "Bool" && tgtBase === "Bool") return true;
  if (srcBase === "Bool" || tgtBase === "Bool") return false;

  const srcMatch = srcBase.match(/^([UI])(\d+)$/);
  const tgtMatch = tgtBase.match(/^([UI])(\d+)$/);
  if (!srcMatch || !tgtMatch) return false;
  if (srcMatch[1] !== tgtMatch[1]) return false;

  return parseInt(srcMatch[2]!, 10) <= parseInt(tgtMatch[2]!, 10);
}

// ── Tokenizer ────────────────────────────────────────────────────────

function tokenize(source: string): string[] {
  const rawTokens = source.trim().split(/\s+/);
  const tokens: string[] = [];

  for (const raw of rawTokens) {
    let remaining = raw;

    while (remaining.startsWith("(")) {
      tokens.push("(");
      remaining = remaining.slice(1);
    }
    while (remaining.startsWith("{")) {
      tokens.push("{");
      remaining = remaining.slice(1);
    }
    while (remaining.startsWith("||")) {
      tokens.push("||");
      remaining = remaining.slice(2);
    }
    while (remaining.startsWith("&&")) {
      tokens.push("&&");
      remaining = remaining.slice(2);
    }

    if (remaining.startsWith("+=")) {
      tokens.push("+=");
      remaining = remaining.slice(2);
    } else if (remaining.startsWith("<=")) {
      tokens.push("<=");
      remaining = remaining.slice(2);
    } else if (remaining.startsWith(">=")) {
      tokens.push(">=");
      remaining = remaining.slice(2);
    } else if (remaining.startsWith("==")) {
      tokens.push("==");
      remaining = remaining.slice(2);
    } else if (remaining.startsWith("!=")) {
      tokens.push("!=");
      remaining = remaining.slice(2);
    } else if (remaining.startsWith("<")) {
      tokens.push("<");
      remaining = remaining.slice(1);
    } else if (remaining.startsWith(">")) {
      tokens.push(">");
      remaining = remaining.slice(1);
    } else if (remaining.startsWith("!")) {
      tokens.push("!");
      remaining = remaining.slice(1);
    }

    if (remaining.startsWith("&")) {
      tokens.push("&");
      remaining = remaining.slice(1);
    }
    if (remaining.startsWith("*") && !/^\*[UI]/.test(remaining)) {
      tokens.push("*");
      remaining = remaining.slice(1);
    }

    const trailing: string[] = [];
    while (
      remaining.endsWith(")") ||
      remaining.endsWith("}") ||
      remaining.endsWith(";") ||
      remaining.endsWith(":")
    ) {
      trailing.unshift(remaining[remaining.length - 1]!);
      remaining = remaining.slice(0, -1);
    }

    if (remaining) tokens.push(remaining);
    for (const d of trailing) tokens.push(d);
  }

  return tokens;
}

// ── Parser helpers ───────────────────────────────────────────────────

function peek(ctx: ParserCtx): string | undefined {
  return ctx.tokens[ctx.pos];
}

function consume(ctx: ParserCtx, expected?: string): string {
  const token = ctx.tokens[ctx.pos++]!;
  if (expected && token !== expected) throw new Error("Invalid format");
  return token;
}

function parseIdentifier(ctx: ParserCtx): string {
  const name = consume(ctx);
  if (!ctx.scope.has(name)) throw new Error(`Undefined variable: ${name}`);
  return name;
}

function parseTypeAnnotation(ctx: ParserCtx): string {
  const typeToken = consume(ctx);
  if (
    !/^[UI](8|16|32|64)$/.test(typeToken) &&
    !/^\*[UI](8|16|32|64)$/.test(typeToken) &&
    typeToken !== "Bool"
  )
    throw new Error(`Invalid type: ${typeToken}`);
  return typeToken;
}

// ── Assignment helper (extracted from parseBlockItem) ────────────────

function assignToVariable(
  ctx: ParserCtx,
  opToken: string,
  computeValue: (
    entryVal: bigint,
    exprResult: { value: number | bigint; type: string },
  ) => bigint,
): bigint {
  const name = consume(ctx);
  const entry = ctx.scope.get(name);
  if (!entry || !entry.mutable)
    throw new Error(`Cannot reassign immutable variable: ${name}`);

  consume(ctx, opToken);
  const exprResult = parseExprWithType(ctx);

  if (!isAssignable(exprResult.type, entry.type))
    throw new Error(
      `Cannot assign ${exprResult.type} to variable of type ${entry.type}`,
    );

  const newValue = computeValue(entry.value, exprResult);
  ctx.scope.set(name, { ...entry, value: newValue });

  if (peek(ctx) === ";") consume(ctx, ";");
  return newValue;
}

// ── While loop executor (extracted from parseBlockItem) ───────────────

function executeWhileLoop(ctx: ParserCtx): bigint | null {
  consume(ctx, "while");
  consume(ctx, "(");

  // Save position so we can re-parse condition each iteration
  const condStart = ctx.pos;

  let blockValue: bigint | null = null;
  for (let iter = 0; iter < MAX_WHILE_ITERATIONS; iter++) {
    // Re-parse condition from saved position
    ctx.pos = condStart;
    const condResult = parseExprWithType(ctx);
    if (condResult.type !== "Bool")
      throw new Error(`While condition must be Bool, got ${condResult.type}`);

    consume(ctx, ")");

    // If false, skip past the body tokens without executing them
    if (condResult.value === 0) {
      skipBodyTokens(ctx);
      return blockValue;
    }

    // Execute body: brace-enclosed block or single statement
    const itemValue = parseWhileBody(ctx);
    if (itemValue !== null) blockValue = itemValue;
  }

  return blockValue;
}

// Parse and execute the while-loop body. Handles both `{ ... }` blocks
// with multiple statements, and bare single-statement bodies.
function parseWhileBody(ctx: ParserCtx): bigint | null {
  if (peek(ctx) === "{") {
    consume(ctx, "{");
    let lastValue: bigint | null = null;
    while (!peek(ctx) || peek(ctx) !== "}") {
      const itemValue = parseBlockItem(ctx);
      if (itemValue !== null) lastValue = itemValue;
    }
    consume(ctx, "}");
    return lastValue;
  }

  // Single bare statement body
  const itemValue = parseBlockItem(ctx);
  return itemValue;
}

// Skip past the tokens that make up one while-loop body (without executing).
function skipBodyTokens(ctx: ParserCtx): void {
  if (peek(ctx) === "{") {
    let depth = 1;
    consume(ctx); // opening "{"
    while (depth > 0 && ctx.pos < ctx.tokens.length) {
      const t = consume(ctx);
      if (t === "{") depth++;
      else if (t === "}") depth--;
    }
    return;
  }

  // Otherwise skip one statement: advance until we hit ";" or run out of tokens.
  while (ctx.pos < ctx.tokens.length && peek(ctx) !== ";") {
    consume(ctx);
  }
  if (peek(ctx) === ";") consume(ctx, ";");
}

// ── Block item parser ───────────────────────────────────────────────

function parseBlockItem(ctx: ParserCtx): bigint | null {
  // While loop statement
  if (peek(ctx) === "while") return executeWhileLoop(ctx);

  // Let declaration
  if (peek(ctx) === "let") {
    consume(ctx, "let");
    const mutable = peek(ctx) === "mut";
    if (mutable) consume(ctx, "mut");

    const name = consume(ctx);

    let declaredType: string | undefined;
    if (peek(ctx) === ":") {
      consume(ctx, ":");
      declaredType = parseTypeAnnotation(ctx);
    }

    consume(ctx, "=");
    const exprResult = parseExprWithType(ctx);
    const value = BigInt(exprResult.value);

    if (declaredType) {
      if (!isAssignable(exprResult.type, declaredType))
        throw new Error(
          `Cannot assign ${exprResult.type} to variable of type ${declaredType}`,
        );
      ctx.scope.set(name, { value, type: declaredType, mutable });
    } else {
      ctx.scope.set(name, { value, type: exprResult.type, mutable });
    }

    if (peek(ctx) === ";") consume(ctx, ";");
    return null;
  }

  // Assignment / compound assignment expressions
  const p = peek(ctx);
  if (p && /^[a-zA-Z_]\w*$/.test(p) && ctx.tokens[ctx.pos + 1] === "=") {
    return assignToVariable(ctx, "=", (_entryVal, exprResult) =>
      BigInt(exprResult.value),
    );
  }

  if (p && /^[a-zA-Z_]\w*$/.test(p) && ctx.tokens[ctx.pos + 1] === "+=") {
    return assignToVariable(
      ctx,
      "+=",
      (entryVal, exprResult) => entryVal + BigInt(exprResult.value),
    );
  }

  // Plain expression statement
  const exprResult = parseExprWithType(ctx);
  if (peek(ctx) === ";") consume(ctx, ";");
  return BigInt(exprResult.value);
}

// ── Logical operator helper (extracted from parseExprWithType) ───────

function applyLogicalOp(
  ctx: ParserCtx,
  left: { value: bigint; type: string },
  opName: string,
  bitwiseFn: (a: bigint, b: bigint) => bigint,
): void {
  const right = parseTermWithType(ctx);

  if (left.type !== "Bool" || right.type !== "Bool")
    throw new Error(
      `Logical ${opName} requires Bool operands, got ${left.type} and ${right.type}`,
    );

  left.value = BigInt(bitwiseFn(BigInt(left.value), BigInt(right.value)));
}

// ── Expression parser (with type tracking) ───────────────────────────

function parseExprWithType(ctx: ParserCtx): {
  value: number | bigint;
  type: string;
} {
  const left = parseTermWithType(ctx);

  // Addition / subtraction
  while (peek(ctx) === "+" || peek(ctx) === "-") {
    const op = consume(ctx);
    const right = parseTermWithType(ctx);
    const combinedType = combineTypes(left.type, right.type);

    if (op === "+") left.value = BigInt(left.value) + BigInt(right.value);
    else left.value = BigInt(left.value) - BigInt(right.value);

    left.type = combinedType;
  }

  // Comparison operators: < > <= >= == != — result is Bool type
  const comparisonOps = ["<", ">", "<=", ">=", "==", "!="];
  while (comparisonOps.includes(peek(ctx) ?? "")) {
    const op = consume(ctx);
    const right = parseTermWithType(ctx);

    if ((left.type === "Bool") !== (right.type === "Bool"))
      throw new Error(
        `Type mismatch in comparison: ${left.type} and ${right.type}`,
      );

    let cmpResult: bigint;
    switch (op) {
      case "<":
        cmpResult = BigInt(left.value) < BigInt(right.value) ? 1n : 0n;
        break;
      case ">":
        cmpResult = BigInt(left.value) > BigInt(right.value) ? 1n : 0n;
        break;
      case "<=":
        cmpResult = BigInt(left.value) <= BigInt(right.value) ? 1n : 0n;
        break;
      case ">=":
        cmpResult = BigInt(left.value) >= BigInt(right.value) ? 1n : 0n;
        break;
      case "==":
        cmpResult = BigInt(left.value) === BigInt(right.value) ? 1n : 0n;
        break;
      case "!=":
        cmpResult = BigInt(left.value) !== BigInt(right.value) ? 1n : 0n;
        break;
      default:
        throw new Error(`Unknown comparison operator: ${op}`);
    }

    left.value = cmpResult;
    left.type = "Bool";
  }

  // Logical OR / AND — only allowed on Bool types
  while (peek(ctx) === "||") {
    consume(ctx, "||");
    applyLogicalOp(
      ctx,
      left as { value: bigint; type: string },
      "OR",
      (a, b) => a | b,
    );
  }

  while (peek(ctx) === "&&") {
    consume(ctx, "&&");
    applyLogicalOp(
      ctx,
      left as { value: bigint; type: string },
      "AND",
      (a, b) => a & b,
    );
  }

  return { value: normalizeResult(BigInt(left.value)), type: left.type };
}

// ── Term parser ──────────────────────────────────────────────────────

function parseTermWithType(ctx: ParserCtx): {
  value: number | bigint;
  type: string;
} {
  let result: { value: bigint; type: string };
  const token = peek(ctx);

  if (token === "if") {
    consume(ctx, "if");
    consume(ctx, "(");
    const condResult = parseExprWithType(ctx);
    consume(ctx, ")");
    if (condResult.type !== "Bool")
      throw new Error(`If condition must be Bool, got ${condResult.type}`);

    const thenBranch = parseTermWithType(ctx);
    consume(ctx, "else");
    const elseBranch = parseTermWithType(ctx);

    if (thenBranch.type !== elseBranch.type)
      throw new Error(
        `If/else branch type mismatch: ${thenBranch.type} vs ${elseBranch.type}`,
      );

    result =
      condResult.value != 0
        ? { value: BigInt(thenBranch.value), type: thenBranch.type }
        : { value: BigInt(elseBranch.value), type: elseBranch.type };
  } else if (token === "(") {
    consume(ctx, "(");
    const inner = parseExprWithType(ctx);
    consume(ctx, ")");
    result = { value: BigInt(inner.value), type: inner.type };
  } else if (token === "{") {
    consume(ctx, "{");
    let blockValue: bigint | undefined;
    while (!peek(ctx) || peek(ctx) !== "}") {
      const itemValue = parseBlockItem(ctx);
      if (itemValue !== null) blockValue = itemValue;
    }
    consume(ctx, "}");
    result = { value: blockValue!, type: "U8" };
  } else if (token === "&") {
    // Reference operator — returns pointer type *T
    consume(ctx, "&");
    const name = parseIdentifier(ctx);
    const entry = ctx.scope.get(name)!;
    result = { value: entry.value, type: "*" + entry.type };
  } else if (token === "*") {
    // Dereference operator — strips the leading * to get base type T
    consume(ctx, "*");
    const name = parseIdentifier(ctx);
    const entry = ctx.scope.get(name)!;
    if (!entry.type.startsWith("*"))
      throw new Error(`Cannot dereference non-pointer type: ${entry.type}`);
    result = { value: entry.value, type: entry.type.replace(/^\*/, "") };
  } else if (token === "true") {
    consume(ctx, "true");
    result = { value: 1n, type: "Bool" };
  } else if (token === "false") {
    consume(ctx, "false");
    result = { value: 0n, type: "Bool" };
  } else if (token && /^[a-zA-Z_]\w*$/.test(token)) {
    // Variable reference — use the stored type from scope
    const name = parseIdentifier(ctx);
    const entry = ctx.scope.get(name)!;
    result = { value: entry.value, type: entry.type };
  } else {
    // Literal token (e.g., "100U8")
    const literalToken = consume(ctx);
    result = {
      value: BigInt(parseLiteral(literalToken)),
      type: inferLiteralType(literalToken),
    };
  }

  // Multiplication / division — higher precedence than + -
  while (peek(ctx) === "*" || peek(ctx) === "/") {
    const op = consume(ctx);
    const rightResult = parseTermWithType(ctx);
    result.type = combineTypes(result.type, rightResult.type);

    if (op === "*") result.value *= BigInt(rightResult.value);
    else {
      if (BigInt(rightResult.value) === 0n) throw new Error("Division by zero");
      result.value /= BigInt(rightResult.value);
    }
  }

  return { value: normalizeResult(result.value), type: result.type };
}

// ── Public entry point ───────────────────────────────────────────────

export function executeTuff(tuffSourceCode: string): number | bigint {
  if (tuffSourceCode === "") return 0;

  const tokens = tokenize(tuffSourceCode);
  let pos = 0;
  const scope = new Map<
    string,
    { value: bigint; type: string; mutable: boolean }
  >();

  const ctx: ParserCtx = {
    tokens,
    get pos() {
      return pos;
    },
    set pos(v) {
      pos = v;
    },
    scope,
  };

  let finalResult = 0n;
  while (pos < tokens.length) {
    const itemValue = parseBlockItem(ctx);
    if (itemValue !== null) finalResult = BigInt(itemValue);
  }

  return normalizeResult(finalResult);
}
