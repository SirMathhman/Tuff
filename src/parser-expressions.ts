import type { Token, ScopeValue, EvalContext } from "./types.js";
import { isOp, peek, consume, tokenize } from "./tokenizer.js";
import {
  getTypeAnnotations,
  getPointerTargets,
  getNonZeroSet,
} from "./shared-state.js";

// Lazy reference to break circular dependency — assigned at runtime when first needed.
let resolveBlocksWithScope: (
  input: string,
  scope: Map<string, ScopeValue>,
) => number;
export function setResolveBlocks(
  fn: (input: string, scope: Map<string, ScopeValue>) => number,
): void {
  resolveBlocksWithScope = fn;
}

const COMPARISON_OPS = new Set(["<", ">", "<=", ">=", "==", "!="]);

function isComparisonOp(token: Token): boolean {
  return isOp(token) && COMPARISON_OPS.has(token.value);
}

/** Extract bit width from a type name like U8, I32, F64 => 8, 32, 64. */
export function getTypeBitWidth(typeName: string): number {
  const match = typeName.match(/(\d+)/);
  return match && match[1] ? parseInt(match[1], 10) : 0;
}

const BIT_WIDTHS = [8, 16, 32, 64];

function nextWiderBitWidth(width: number): number {
  const idx = BIT_WIDTHS.indexOf(width);
  if (idx >= 0 && idx < BIT_WIDTHS.length - 1) return BIT_WIDTHS[idx + 1]!;
  return width * 2;
}

const DEFAULT_TYPE = "I32";

/** Given two type names, return the promoted type. */
export function promoteTypes(
  a: string | undefined,
  b: string | undefined,
): string | undefined {
  if (!a || !b) return undefined;
  const aWidth = getTypeBitWidth(a);
  const bWidth = getTypeBitWidth(b);

  if (aWidth === 0 && bWidth === 0) return a === b ? a : undefined;
  if (a === DEFAULT_TYPE && b !== DEFAULT_TYPE) return b;
  if (b === DEFAULT_TYPE && a !== DEFAULT_TYPE) return a;

  if (aWidth === bWidth && a !== b) {
    const wider = nextWiderBitWidth(aWidth);
    return `I${wider}`;
  }

  if (bWidth <= aWidth) return a;
  return b;
}

/** Check if inferred type can safely widen to the annotated type. */
export function isSafeWiden(inferred: string, annotated: string): boolean {
  const iWidth = getTypeBitWidth(inferred);
  const aWidth = getTypeBitWidth(annotated);
  if (iWidth === 0 || aWidth === 0) return inferred === annotated;
  const sameSign = inferred[0]!.toLowerCase() === annotated[0]!.toLowerCase();
  return sameSign && iWidth <= aWidth;
}

/** Parse an object literal like `{ key1 : val1, key2 : val2 }`. */
export function parseObjectLiteral(
  tokens: Token[],
  pos: [number],
  scope: Map<string, ScopeValue>,
): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  while (true) {
    const next = peek(tokens, pos);
    if (!next || (isOp(next) && next.value === "}")) break;

    if (next.type !== "id") throw new Error("Expected object property name");
    consume(tokens, pos);
    const propName = next.value;

    const colonToken = peek(tokens, pos);
    if (!colonToken || !isOp(colonToken) || colonToken.value !== ":") {
      throw new Error("Expected ':' after object property name");
    }
    consume(tokens, pos);

    const val = parseExpression(
      tokens,
      pos,
      scope as unknown as Map<string, unknown>,
    );
    obj[propName] = val;
  }
  return obj;
}

/** Get and delete a function definition from scope (functions are single-use). */
export function getFunction(
  scope: Map<string, ScopeValue>,
  name: string,
): { body: string; params: string[] } | undefined {
  const fn = scope.get("__fn__" + name);
  if (fn !== undefined) {
    scope.delete("__fn__" + name);
    return fn as unknown as { body: string; params: string[] };
  }
  return undefined;
}

/** Resolve an identifier token, handling function calls and chained access. */
export function resolveIdentifier(
  tokens: Token[],
  pos: [number],
  scope: Map<string, ScopeValue>,
): unknown {
  const token = peek(tokens, pos);
  if (!token || token.type !== "id") throw new Error("Expected identifier");
  consume(tokens, pos);

  // Check for function call: name(
  const nextToken = peek(tokens, pos);
  if (nextToken && isOp(nextToken) && nextToken.value === "(") {
    const fnDef = getFunction(scope, token.value);
    if (fnDef !== undefined) {
      consume(tokens, pos); // consume (
      const args: unknown[] = [];
      while (true) {
        const peekNext = peek(tokens, pos);
        if (!peekNext || (isOp(peekNext) && peekNext.value === ")")) break;
        let argValue: unknown;
        if (isOp(peekNext) && peekNext.value === "[") {
          argValue = parseValuePrimary(tokens, pos, scope);
        } else {
          argValue = parseExpression(
            tokens,
            pos,
            scope as unknown as Map<string, unknown>,
          );
        }
        args.push(argValue);
      }
      const closeParen = peek(tokens, pos);
      if (closeParen && isOp(closeParen) && closeParen.value === ")") {
        consume(tokens, pos); // consume )
      }
      const fnScope = new Map(scope);
      for (let i = 0; i < fnDef.params.length; i++) {
        const paramName = fnDef.params[i];
        if (paramName !== undefined && args[i] !== undefined) {
          fnScope.set(paramName, args[i]);
        }
      }
      return resolveBlocksWithScope(fnDef.body, fnScope);
    }
    throw new Error(`Undefined function: ${token.value}`);
  }

  let value = scope.get(token.value);
  if (value === undefined)
    throw new Error(`Undefined variable: ${token.value}`);

  // Handle chained access: arr[0][1] and obj.prop
  while (true) {
    const nextToken = peek(tokens, pos);
    if (!nextToken || !isOp(nextToken)) break;

    if (nextToken.value === "[") {
      consume(tokens, pos); // consume [
      const idx = parseExpression(
        tokens,
        pos,
        scope as unknown as Map<string, unknown>,
      );
      consume(tokens, pos); // consume ]
      if (!Array.isArray(value)) throw new Error("Cannot index non-array");
      value = (value as unknown[])[idx];
    } else if (nextToken.value === ".") {
      consume(tokens, pos); // consume .
      const propToken = peek(tokens, pos);
      if (!propToken) throw new Error("Expected property name after dot");

      // Handle tuple field access: `.0`, `.1` etc. (numeric index after dot)
      if (propToken.type === "number") {
        consume(tokens, pos);
        const fieldIdx = propToken.value;
        if (
          typeof value === "object" &&
          value !== null &&
          "__tuple__" in value
        ) {
          value = (
            value as unknown as Record<string, unknown> & { values: unknown[] }
          ).values[fieldIdx];
        } else {
          throw new Error(
            `Cannot access tuple field on non-tuple: ${String(value)}`,
          );
        }
        // Handle object property access: `.prop` (identifier after dot)
      } else if (propToken.type === "id") {
        consume(tokens, pos);
        if (typeof value === "object" && value !== null) {
          value = (value as Record<string, unknown>)[propToken.value];
        } else {
          throw new Error(
            `Cannot access property on non-object: ${String(value)}`,
          );
        }
      } else {
        throw new Error("Expected property name or numeric field after dot");
      }
    } else break;
  }

  return value;
}

function parseValuePrimary(
  tokens: Token[],
  pos: [number],
  scope: Map<string, ScopeValue>,
): unknown {
  const token = peek(tokens, pos);
  if (!token) throw new Error("Unexpected end of input");

  if (token.type === "number") {
    consume(tokens, pos);
    return token.value;
  }

  if (token.type === "boolean") {
    consume(tokens, pos);
    return token.value ? 1 : 0;
  }

  if (isOp(token) && token.value === "[") {
    consume(tokens, pos); // consume [
    const arr: unknown[] = [];
    while (true) {
      const next = peek(tokens, pos);
      if (!next || (isOp(next) && next.value === "]")) break;
      arr.push(parseValuePrimary(tokens, pos, scope));
    }
    consume(tokens, pos); // consume ]
    return arr;
  }

  // Tuple literal: `(expr, expr)` - parse as array with tuple marker
  if (isOp(token) && token.value === "(") {
    consume(tokens, pos); // consume (
    const tupl: unknown[] = [];
    while (true) {
      const next = peek(tokens, pos);
      if (!next || (isOp(next) && next.value === ")")) break;
      // Skip commas
      if (!(isOp(next) && next.value === ",")) {
        tupl.push(parseValuePrimary(tokens, pos, scope));
      } else {
        consume(tokens, pos); // skip ,
      }
    }
    consume(tokens, pos); // consume )
    return { __tuple__: true, values: tupl };
  }

  if (token.type === "id") {
    return resolveIdentifier(tokens, pos, scope);
  }

  throw new Error(`Unexpected token: ${token.type}`);
}

/** Evaluate a comparison and return 1 for true, 0 for false. */
function evaluateComparison(left: number, op: string, right: number): number {
  switch (op) {
    case "<":
      return left < right ? 1 : 0;
    case ">":
      return left > right ? 1 : 0;
    case "<=":
      return left <= right ? 1 : 0;
    case ">=":
      return left >= right ? 1 : 0;
    case "==":
      return left === right ? 1 : 0;
    case "!=":
      return left !== right ? 1 : 0;
    default:
      throw new Error(`Unknown comparison operator: ${op}`);
  }
}

/** Parse comparison expressions like `a < b`, `x >= 4`, and `expr is Type`. */
function parseComparison(
  tokens: Token[],
  pos: [number],
  scope: Map<string, unknown>,
  ctx?: EvalContext,
): number {
  let left = parseTerm(tokens, pos, scope, ctx);
  while (true) {
    const currentToken = peek(tokens, pos);
    if (!currentToken || !isComparisonOp(currentToken)) break;
    consume(tokens, pos);
    const right = parseTerm(tokens, pos, scope, ctx);
    left = evaluateComparison(left, currentToken.value as string, right);
  }
  // Check for `is <Type>` operator
  if (ctx) {
    const isTok = peek(tokens, pos);
    if (isTok && isTok.type === "id" && isTok.value.toLowerCase() === "is") {
      consume(tokens, pos); // consume 'is'
      const typeTok = peek(tokens, pos);
      if (!typeTok || typeTok.type !== "id")
        throw new Error("Expected type name after 'is'");
      consume(tokens, pos);
      left = ctx.lastResultType === typeTok.value ? 1 : 0;
    }
  }
  return left;
}

/** Recursive descent parser for arithmetic expressions. */
export function parseExpression(
  tokens: Token[],
  pos: [number],
  scope: Map<string, unknown>,
  ctx?: EvalContext,
): number {
  let left = parseComparison(tokens, pos, scope, ctx);
  while (true) {
    const currentToken = peek(tokens, pos);
    if (
      !currentToken ||
      !isOp(currentToken) ||
      !"+-".includes(currentToken.value)
    )
      break;
    consume(tokens, pos);
    const savedLeftType = ctx?.lastResultType;
    const right = parseTerm(tokens, pos, scope, ctx);
    if (ctx && savedLeftType && ctx.lastResultType) {
      ctx.lastResultType = promoteTypes(savedLeftType, ctx.lastResultType);
    } else if (ctx) {
      ctx.lastResultType = undefined;
    }
    left = currentToken.value === "+" ? left + right : left - right;
  }
  return left;
}

function parseTerm(
  tokens: Token[],
  pos: [number],
  scope: Map<string, unknown>,
  ctx?: EvalContext,
): number {
  let left = parseUnary(tokens, pos, scope, ctx);
  while (true) {
    const currentToken = peek(tokens, pos);
    if (
      !currentToken ||
      !isOp(currentToken) ||
      !"*/".includes(currentToken.value)
    )
      break;
    consume(tokens, pos);

    // For division, mark context so identifier resolution can check non-zero guarantee
    if (ctx && currentToken.value === "/") {
      ctx.isDivisor = true;
    }
    const right = parseUnary(tokens, pos, scope, ctx);
    if (ctx) ctx.isDivisor = false; // reset after parsing divisor

    left = currentToken.value === "*" ? left * right : left / right;
  }
  return left;
}

function parseUnary(
  tokens: Token[],
  pos: [number],
  scope: Map<string, unknown>,
  ctx?: EvalContext,
): number {
  while (true) {
    const currentToken = peek(tokens, pos);
    if (!currentToken || !isOp(currentToken)) break;

    // Check for dereference operator `*` — only when followed by an identifier
    if (currentToken.value === "*") {
      const nextToken = tokens[pos[0] + 1];
      if (nextToken && nextToken.type === "id") {
        consume(tokens, pos); // consume *
        const ptrTargets = getPointerTargets(
          scope as unknown as Map<string, ScopeValue>,
        );
        const targetName = ptrTargets.get(nextToken.value);
        if (!targetName) {
          throw new Error(
            `Cannot dereference non-pointer variable: ${nextToken.value}`,
          );
        }
        // Resolve the target variable's current value from scope
        const resolved = resolveIdentifier(
          tokens,
          pos,
          scope as unknown as Map<string, ScopeValue>,
        );
        return typeof resolved === "number" ? resolved : 0;
      } else {
        break; // Not dereference — let parseTerm handle * as multiplication
      }
    }

    if (currentToken.value !== "-" && currentToken.value !== "+") break;

    const nextToken = tokens[pos[0] + 1];
    if (
      nextToken?.type === "number" &&
      nextToken.suffix &&
      /^[uU]/.test(nextToken.suffix)
    ) {
      throw new Error(
        `Cannot apply unary minus to unsigned typed literal: -${nextToken.value}${nextToken.suffix}`,
      );
    }

    consume(tokens, pos);
    const operand = parseUnary(tokens, pos, scope, ctx);
    return typeof operand === "number"
      ? currentToken.value === "-"
        ? -operand
        : operand
      : operand;
  }
  return parsePrimary(tokens, pos, scope, ctx);
}

function parseIfExpr(
  tokens: Token[],
  pos: [number],
  scope: Map<string, unknown>,
): number {
  consume(tokens, pos); // Consume 'if' keyword

  const parenToken = peek(tokens, pos);
  if (parenToken && isOp(parenToken) && parenToken.value === "(") {
    consume(tokens, pos); // consume (
    const cond = parseExpression(tokens, pos, scope);
    const closeParen = peek(tokens, pos);
    if (closeParen && isOp(closeParen) && closeParen.value === ")") {
      consume(tokens, pos); // consume )
    }

    const thenValue = parseExpression(tokens, pos, scope);

    const nextToken = peek(tokens, pos);
    if (
      nextToken &&
      nextToken.type === "keyword" &&
      nextToken.value === "else"
    ) {
      consume(tokens, pos); // consume 'else'
      const elseValue = parseExpression(tokens, pos, scope);
      return cond !== 0 ? thenValue : elseValue;
    }

    return thenValue;
  }

  throw new Error("Expected condition after if");
}

function parsePrimary(
  tokens: Token[],
  pos: [number],
  scope: Map<string, unknown>,
  ctx?: EvalContext,
): number {
  const token = peek(tokens, pos);
  if (token && token.type === "keyword" && token.value === "if") {
    return parseIfExpr(tokens, pos, scope);
  }

  // Handle parenthesized expressions: ( expr ) or tuple literals: (expr, expr)
  if (token && isOp(token) && token.value === "(") {
    // Try parsing as a value primary first - this handles both tuples and grouped expressions
    const savedPos = pos[0];
    try {
      const valResult = parseValuePrimary(tokens, pos, scope as unknown as Map<string, ScopeValue>);
      if (typeof valResult === "object" && valResult !== null) {
        // Successfully parsed a tuple or other value - return first element for expression context
        if ("__tuple__" in valResult) {
          const tValues = (valResult as Record<string, unknown>).values;
          return Array.isArray(tValues) ? Number(tValues[0] ?? 0) : 0;
        }
      }
    } catch {
      // Not a value primary, fall through to parenthesized expression parsing
    }

    // Reset position and parse as regular parenthesized expression
    pos[0] = savedPos;
    consume(tokens, pos); // consume (
    const result = parseExpression(tokens, pos, scope, ctx);
    const closeParen = peek(tokens, pos);
    if (!closeParen || !isOp(closeParen) || closeParen.value !== ")")
      throw new Error("Expected closing parenthesis");
    consume(tokens, pos); // consume )
    return result;
  }

  // Capture type suffix from numeric literals before consuming
  if (ctx && token?.type === "number") {
    ctx.lastResultType = token.suffix ?? "I32";
  } else if (ctx) {
    if (token?.type === "id") {
      const annots = getTypeAnnotations(
        scope as unknown as Map<string, ScopeValue>,
      );
      ctx.lastResultType = annots.get(token.value) ?? undefined;

      // Division safety: when resolving an identifier as a divisor, check non-zero guarantee
      if (ctx.isDivisor) {
        const nzSet = getNonZeroSet(
          scope as unknown as Map<string, ScopeValue>,
        );
        if (!nzSet.has(token.value)) {
          throw new Error(
            `Division by variable '${token.value}' without != 0 refinement is not allowed`,
          );
        }
      }
    } else {
      ctx.lastResultType = undefined;
    }
  }

  const value = parseValuePrimary(
    tokens,
    pos,
    scope as unknown as Map<string, ScopeValue>,
  );
  return typeof value === "number" ? value : 0;
}

/** Evaluate an expression string and return a number. */
export function evaluateExpression(
  input: string,
  scope?: Map<string, unknown>,
): number {
  const tokens = tokenize(input);
  if (tokens.length === 0) throw new Error("Empty expression");
  return parseExpression(tokens, [0], scope ?? new Map(), {
    lastResultType: undefined,
    isDivisor: false,
  });
}

/** Extract the inferred type of an expression without evaluating it. */
export function inferExpressionType(
  input: string,
  scope?: Map<string, unknown>,
): string | undefined {
  const tokens = tokenize(input);
  if (tokens.length === 0) throw new Error("Empty expression");
  const ctx: EvalContext = { lastResultType: undefined, isDivisor: false };
  parseExpression(tokens, [0], scope ?? new Map(), ctx);
  return ctx.lastResultType;
}

/** Parse a value expression that can be a number, array, or object. */
export function parseValue(
  input: string,
  scope: Map<string, ScopeValue>,
): unknown {
  const tokens = tokenize(input.trim());
  if (tokens.length === 0) throw new Error("Empty expression");

  // If the first token is an array literal start or tuple literal start, parse as value
  if (
    isOp(tokens[0]!) &&
    (tokens[0].value === "[" || tokens[0].value === "(")
  ) {
    return parseValuePrimary(tokens, [0], scope);
  }

  // Object literal: { key : expr } - detect by opening brace followed by identifier and colon
  const third = peek(tokens, [2]);
  if (
    isOp(tokens[0]!) &&
    tokens[0].value === "{" &&
    peek(tokens, [1])?.type === "id" &&
    third !== undefined &&
    isOp(third) &&
    third.value === ":"
  ) {
    consume(tokens, [0]); // consume {
    const obj = parseObjectLiteral(tokens, [0], scope);
    return obj;
  }

  // Otherwise parse as arithmetic expression and return number
  return parseExpression(tokens, [0], scope as unknown as Map<string, unknown>);
}
