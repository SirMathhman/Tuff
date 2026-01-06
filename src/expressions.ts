import { Result, InterpretError, Value, Token, ok, err } from "./types";
import { parseStructLiteral, parseMemberAccess } from "./structs";
import { parseBraced, parseIfExpression } from "./statements";
import { requireNumber } from "./numberUtils";

import { ParserLike } from "./parserInterfaces";

function requirePeek(parser: ParserLike): Result<Token, InterpretError> {
  const tk = parser.peek();
  if (!tk)
    return err({ type: "InvalidInput", message: "Unable to interpret input" });
  return ok(tk);
}

function tryStructLiteral(
  parser: ParserLike,
  name: string,
  next: Token | undefined
): Result<Value, InterpretError> | undefined {
  if (next && next.type === "op" && next.value === "{") {
    const typeDef = parser.lookupType(name);
    if (!typeDef)
      return err({ type: "InvalidInput", message: `Unknown type: ${name}` });
    parser.consume();
    return parseStructLiteral(parser, typeDef);
  }
  return undefined;
}

function tryFunctionCall(
  parser: ParserLike,
  name: string,
  next: Token | undefined
): Result<Value, InterpretError> | undefined {
  if (next && next.type === "op" && next.value === "(")
    return parser.parseCall(name);
  return undefined;
}

function tryMemberAccess(
  parser: ParserLike,
  name: string,
  next: Token | undefined
): Result<Value, InterpretError> | undefined {
  if (next && next.type === "op" && next.value === ".")
    return parseMemberAccess(parser, name);
  return undefined;
}

export function parsePrimary(
  parser: ParserLike
): Result<Value, InterpretError> {
  const tkR = requirePeek(parser);
  if (!tkR.ok) return tkR;
  const tk = tkR.value;

  // parentheses
  if (tk.type === "op" && tk.value === "(") {
    return parser.parseParenthesized();
  }

  // braces (block/grouping)
  if (tk.type === "op" && tk.value === "{") {
    return parseBraced(parser);
  }

  // numeric literal
  if (tk.type === "num") {
    parser.consume();
    return ok(tk.value);
  }

  // boolean literal
  if (tk.type === "id" && (tk.value === "true" || tk.value === "false")) {
    parser.consume();
    return ok(tk.value === "true" ? 1 : 0);
  }

  if (tk.type === "id") {
    const r = parseIdentifierLike(parser, tk);
    if (r) return r;
  }

  return err({ type: "InvalidInput", message: "Unable to interpret input" });
}

export function parseIdentifierLike(
  parser: ParserLike,
  tk: Token
): Result<Value, InterpretError> | undefined {
  // token value should be a string for identifier-like handling
  if (typeof tk.value !== "string")
    return err({ type: "InvalidInput", message: "Unable to interpret input" });

  // conditional
  if (tk.value === "if") return parseIfExpression(parser);

  const next = parser.peekNext();

  const structR = tryStructLiteral(parser, tk.value, next);
  if (structR) return structR;
  const callR = tryFunctionCall(parser, tk.value, next);
  if (callR) return callR;
  const memberR = tryMemberAccess(parser, tk.value, next);
  if (memberR) return memberR;

  // otherwise variable lookup
  const v = parser.lookupVar(tk.value);
  if (v !== undefined) {
    parser.consume();
    return ok(v);
  }

  return err({ type: "UndefinedIdentifier", identifier: tk.value });
}

export function parseFactor(parser: ParserLike): Result<Value, InterpretError> {
  const tk = parser.peek();
  if (!tk)
    return err({ type: "InvalidInput", message: "Unable to interpret input" });

  if (tk.type === "op" && tk.value === "-") {
    parser.consume();
    const r = parseFactor(parser);
    return r.ok ? ok(-r.value) : err(r.error);
  }

  return parsePrimary(parser);
}

export function parseBinary(
  parser: ParserLike,
  nextParser: () => Result<Value, InterpretError>,
  ops: Set<string>,
  apply: (op: string, a: number, b: number) => number
): Result<Value, InterpretError> {
  const left = nextParser();
  if (!left.ok) return left;

  let p = parser.peek();
  if (!p || p.type !== "op" || !ops.has(p.value)) {
    return ok(left.value);
  }

  const leftNumR = requireNumber(left.value, "Left operand must be numeric");
  if (!leftNumR.ok) return leftNumR;
  let val = leftNumR.value;

  while (p && p.type === "op" && ops.has(p.value)) {
    const opToken = parser.consume();
    if (!opToken)
      return err({
        type: "InvalidInput",
        message: "Unable to interpret input",
      });
    const op = String(opToken.value);
    const right = nextParser();
    if (!right.ok) return right;
    const rightNumR = requireNumber(
      right.value,
      "Right operand must be numeric"
    );
    if (!rightNumR.ok) return rightNumR;
    val = apply(op, val, rightNumR.value);
    p = parser.peek();
  }
  return ok(val);
}

export function parseTerm(parser: ParserLike): Result<Value, InterpretError> {
  return parseBinary(
    parser,
    () => parseFactor(parser),
    new Set(["*", "/"]),
    (op, a, b) => (op === "*" ? a * b : a / b)
  );
}

export function parseExpr(parser: ParserLike): Result<Value, InterpretError> {
  return parseBinary(
    parser,
    () => parseTerm(parser),
    new Set(["+", "-"]),
    (op, a, b) => (op === "+" ? a + b : a - b)
  );
}
