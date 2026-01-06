import { Result, InterpretError, Value, ok, err, Token } from "./types";

export interface ParserLike {
  peek(): Token | undefined;
  consume(): Token | undefined;
  parseExpr(): Result<Value, InterpretError>;
  getScopes(): Map<string, Value>[];
}

function parseSingleParam(parser: ParserLike): Result<void, InterpretError> {
  const nameTok = parser.consume();
  if (!nameTok || nameTok.type !== "id")
    return err({ type: "InvalidInput", message: "Expected parameter name" });

  const colon = parser.peek();
  if (!colon || colon.type !== "op" || colon.value !== ":")
    return err({
      type: "InvalidInput",
      message: "Expected : after parameter name",
    });
  parser.consume(); // consume ':'

  const typeTok = parser.consume();
  if (!typeTok || typeTok.type !== "id")
    return err({ type: "InvalidInput", message: "Expected type name after :" });

  const maybeSep = parser.peek();
  if (
    maybeSep &&
    maybeSep.type === "op" &&
    (maybeSep.value === "," || maybeSep.value === ";")
  )
    parser.consume();
  return ok(undefined);
}

function parseParamList(parser: ParserLike): Result<void, InterpretError> {
  // expects '(' already consumed
  while (true) {
    const p = parser.peek();
    if (!p)
      return err({
        type: "InvalidInput",
        message: "Missing closing ) in parameter list",
      });
    if (p.type === "op" && p.value === ")") {
      parser.consume();
      return ok(undefined);
    }

    const single = parseSingleParam(parser);
    if (!single.ok) return single;
  }
}

function skipBracedBlock(parser: ParserLike): Result<void, InterpretError> {
  const open = parser.consume();
  if (!open || open.type !== "op" || open.value !== "{")
    return err({
      type: "InvalidInput",
      message: "Missing opening brace in function body",
    });
  let depth = 1;
  while (depth > 0) {
    const tk = parser.consume();
    if (!tk)
      return err({
        type: "InvalidInput",
        message: "Unterminated function body",
      });
    if (tk.type === "op") {
      if (tk.value === "{") depth++;
      else if (tk.value === "}") depth--;
    }
  }
  return ok(undefined);
}

export function parseFunctionDeclaration(
  parser: ParserLike
): Result<Value, InterpretError> {
  // consume 'fn'
  const fnTok = parser.consume();
  if (!fnTok || fnTok.type !== "id" || fnTok.value !== "fn")
    return err({ type: "InvalidInput", message: "Expected fn" });

  // next token should be function name
  const nameTok = parser.consume();
  if (!nameTok || nameTok.type !== "id")
    return err({
      type: "InvalidInput",
      message: "Expected identifier after fn",
    });

  const open = parser.consume();
  if (!open || open.type !== "op" || open.value !== "(")
    return err({
      type: "InvalidInput",
      message: "Expected ( after function name",
    });

  const paramsR = parseParamList(parser);
  if (!paramsR.ok) return paramsR;

  const retR = parseOptionalReturnType(parser);
  if (!retR.ok) return retR;

  const arrowR = expectArrow(parser);
  if (!arrowR.ok) return arrowR;

  // skip braced body
  const bodyR = skipBracedBlock(parser);
  if (!bodyR.ok) return bodyR;

  const regR = registerFunctionName(parser, nameTok.value);
  if (!regR.ok) return regR;

  return ok(0);
}

function parseOptionalReturnType(parser: ParserLike): Result<void, InterpretError> {
  const maybeColon = parser.peek();
  if (maybeColon && maybeColon.type === "op" && maybeColon.value === ":") {
    parser.consume();
    const typeTok = parser.consume();
    if (!typeTok || typeTok.type !== "id") return err({ type: "InvalidInput", message: "Expected type name after :" });
  }
  return ok(undefined);
}

function expectArrow(parser: ParserLike): Result<void, InterpretError> {
  const a = parser.consume();
  if (!a || a.type !== "op" || a.value !== "=") return err({ type: "InvalidInput", message: "Expected => in function declaration" });
  const b = parser.consume();
  if (!b || b.type !== "op" || b.value !== ">") return err({ type: "InvalidInput", message: "Expected => in function declaration" });
  return ok(undefined);
}

function registerFunctionName(parser: ParserLike, name: string): Result<void, InterpretError> {
  const scopes = parser.getScopes();
  const top = scopes[scopes.length - 1];
  if (!top) return err({ type: "InvalidInput", message: "Invalid block scope" });
  if (top.has(name)) return err({ type: "InvalidInput", message: "Duplicate declaration" });
  top.set(name, 0);
  return ok(undefined);
}
