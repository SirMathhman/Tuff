/* eslint-disable no-restricted-syntax, @typescript-eslint/no-explicit-any */
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

// Use runtime constructor from the provided parser instance to avoid circular imports
function parseArgs(parser: any): Result<Value[], InterpretError> {
  const args: Value[] = [];
  const next = parser.peek();
  if (next && next.type === "op" && next.value === ")") return ok(args);
  for (;;) {
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
      // continue reading args
      const maybeNext = parser.peek();
      if (!maybeNext)
        return err({
          type: "InvalidInput",
          message: "Missing closing parenthesis in call",
        });
      continue;
    }
    break;
  }
  return ok(args);
}

export function parseCallExternal(
  parser: any,
  name: string
): Result<Value, InterpretError> {
  // assume '(' is next
  parser.consume(); // consume identifier
  parser.consume(); // consume '('
  const argsR = parseArgs(parser);
  if (!argsR.ok) return argsR as any;
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
  if (typeof fv === "number" || fv instanceof Map)
    return err({ type: "InvalidInput", message: "Not a function" });

  const tkOpen = { type: "op", value: "{" } as Token;
  const tkClose = { type: "op", value: "}" } as Token;
  const fn = fv as FunctionValue;
  const bodyTokens = fn.body as Token[];
  const callTokens: Token[] = [tkOpen, ...bodyTokens, tkClose];
  const ParserClass = (parser as any).constructor as new (tokens: Token[]) => any;
  const p2 = new ParserClass(callTokens);
  // param scope for args
  const paramScope = new Map<string, Value>();
  for (let i = 0; i < fn.params.length; i++)
    paramScope.set(fn.params[i], args[i]);
  p2.getScopes().push(paramScope);
  const r = p2.parse();
  if (!r.ok) {
    const inner =
      r.error.type === "InvalidInput"
        ? r.error.message
        : `Undefined identifier: ${r.error.identifier}`;
    return err({
      type: "InvalidInput",
      message: `Error while invoking function ${name}: ${inner}`,
    });
  }
  // unwrap return signal if present
  if (typeof r.value === "object" && (r.value as ReturnSignalValue).type === "return") return ok((r.value as ReturnSignalValue).value);
  return ok(r.value);
}
