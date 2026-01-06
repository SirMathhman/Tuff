import {
  Result,
  Value,
  Token,
  ok,
  err,
  InterpretError,
  FunctionValue,
  ReturnSignalValue,
} from "./types";

export interface CallParserLike {
  peek(): Token | undefined;
  consume(): Token | undefined;
  parseExpr(): Result<Value, InterpretError>;
  lookupVar(name: string): Value | undefined;
  getScopes(): Map<string, Value>[];
  parse(): Result<Value, InterpretError>;
  createChildParser(tokens: Token[]): CallParserLike;
}

function isFunctionValue(value: Value): value is FunctionValue {
  if (typeof value === "number") return false;
  if (value instanceof Map) return false;
  return value.type === "fn";
}

function isReturnSignalValue(value: Value): value is ReturnSignalValue {
  if (typeof value === "number") return false;
  if (value instanceof Map) return false;
  return value.type === "return";
}

function parseArgs(parser: CallParserLike): Result<Value[], InterpretError> {
  const args: Value[] = [];
  const next = parser.peek();
  if (next && next.type === "op" && next.value === ")") return ok(args);
  let done = false;
  while (!done) {
    const aR = parser.parseExpr();
    if (!aR.ok) return aR;
    if (typeof aR.value === "object")
      return err({
        type: "InvalidInput",
        message: "Function arguments must be numeric or values",
      });
    args.push(aR.value);
    const sep = parser.peek();
    if (sep && sep.type === "op" && (sep.value === "," || sep.value === ";")) {
      parser.consume();
      const maybeNext = parser.peek();
      if (!maybeNext)
        return err({
          type: "InvalidInput",
          message: "Missing closing parenthesis in call",
        });
      done = false;
    } else {
      done = true;
    }
  }
  return ok(args);
}

export function parseCallExternal(
  parser: CallParserLike,
  name: string
): Result<Value, InterpretError> {
  // assume '(' is next
  parser.consume(); // consume identifier
  parser.consume(); // consume '('
  const argsR = parseArgs(parser);
  if (!argsR.ok) return err(argsR.error);
  const args = argsR.value;
  const closing = parser.consume();
  if (!closing || closing.type !== "op" || closing.value !== ")")
    return err({
      type: "InvalidInput",
      message: "Missing closing parenthesis in call",
    });

  const fv = parser.lookupVar(name);
  if (fv === undefined)
    return err({ type: "UndefinedIdentifier", identifier: name });
  if (!isFunctionValue(fv))
    return err({ type: "InvalidInput", message: "Not a function" });
  const fn = fv;
  // arity check
  const params = fn.params;
  const expected = params.length;
  const got = args.length;
  if (got !== expected) {
    return err({
      type: "InvalidInput",
      message: `Expected ${expected} arguments, got ${got}`,
    });
  }
  return runFunctionInvocation(fn, args, name, parser);
}

function runFunctionInvocation(
  fn: FunctionValue,
  args: Value[],
  name: string,
  parser: CallParserLike
): Result<Value, InterpretError> {
  const body = fn.body;
  const callTokens: Token[] = [
    { type: "op", value: "{" },
    ...body,
    { type: "op", value: "}" },
  ];
  const p2 = parser.createChildParser(callTokens);
  // param scope for args
  const paramScope = new Map<string, Value>();
  const params = fn.params;
  const paramCount = params.length;
  for (let i = 0; i < paramCount; i++) {
    const paramName = params[i];
    paramScope.set(paramName, args[i]);
  }
  const scopes = p2.getScopes();
  scopes.push(paramScope);
  const r = p2.parse();
  if (!r.ok) {
    const error = r.error;
    const inner =
      error.type === "InvalidInput"
        ? error.message
        : `Undefined identifier: ${error.identifier}`;
    return err({
      type: "InvalidInput",
      message: `Error while invoking function ${name}: ${inner}`,
    });
  }
  const value = r.value;
  if (isReturnSignalValue(value)) return ok(value.value);
  return ok(value);
}
