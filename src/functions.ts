import {
  Result,
  InterpretError,
  Value,
  FunctionValue,
  ok,
  err,
  Token,
} from "./types";

export interface ParserLike {
  peek(): Token | undefined;
  consume(): Token | undefined;
  parseExpr(): Result<Value, InterpretError>;
  getScopes(): Map<string, Value>[];
}

function consumeTokenOrError(
  parser: ParserLike
): Result<Token, InterpretError> {
  const consumed = parser.consume();
  if (!consumed)
    return err({ type: "InvalidInput", message: "Missing function body" });
  return ok(consumed);
}

function parseSingleParam(parser: ParserLike): Result<string, InterpretError> {
  const nameTok = parser.consume();
  if (!nameTok || nameTok.type !== "id")
    return err({ type: "InvalidInput", message: "Expected parameter name" });

  const name = nameTok.value;
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
  return ok(name);
}

function parseParamList(parser: ParserLike): Result<string[], InterpretError> {
  // expects '(' already consumed
  const params: string[] = [];
  while (true) {
    const p = parser.peek();
    if (!p)
      return err({
        type: "InvalidInput",
        message: "Missing closing ) in parameter list",
      });
    if (p.type === "op" && p.value === ")") {
      parser.consume();
      return ok(params);
    }

    const single = parseSingleParam(parser);
    if (!single.ok) return single;
    params.push(single.value);
  }
}

function collectBlockTokens(
  parser: ParserLike
): Result<Token[], InterpretError> {
  const open = parser.consume();
  if (!open || open.type !== "op" || open.value !== "{")
    return err({
      type: "InvalidInput",
      message: "Missing opening brace in function body",
    });
  const out: Token[] = [];
  let depth = 1;
  while (depth > 0) {
    const tk = parser.consume();
    if (!tk)
      return err({
        type: "InvalidInput",
        message: "Unterminated function body",
      });
    if (tk.type === "op") {
      if (tk.value === "{") {
        depth++;
        out.push(tk);
      } else if (tk.value === "}") {
        depth--;
        if (depth === 0) return ok(out);
        out.push(tk);
      } else {
        out.push(tk);
      }
    } else {
      out.push(tk);
    }
  }
  return ok(out);
}

function shouldStopExpressionCollection(
  tk: Token,
  parenDepth: number
): { stop: true; consumeToken: boolean } | { stop: false } {
  if (tk.type !== "op") return { stop: false };
  if (tk.value === ";" && parenDepth === 0) return { stop: true, consumeToken: true };
  if (tk.value === "}" && parenDepth === 0) return { stop: true, consumeToken: false };
  return { stop: false };
}

function updateParenDepth(tk: Token, parenDepth: number): number {
  if (tk.type !== "op") return parenDepth;
  if (tk.value === "(") return parenDepth + 1;
  if (tk.value === ")") return parenDepth > 0 ? parenDepth - 1 : 0;
  return parenDepth;
}

function collectExpressionTokens(
  parser: ParserLike
): Result<Token[], InterpretError> {
  const out: Token[] = [];
  let parenDepth = 0;
  let done = false;
  while (!done) {
    const tk = parser.peek();
    if (!tk) {
      done = true;
    } else {
      const stopInfo = shouldStopExpressionCollection(tk, parenDepth);
      if (stopInfo.stop) {
        if (stopInfo.consumeToken) {
          const consumedR = consumeTokenOrError(parser);
          if (!consumedR.ok) return consumedR;
          out.push(consumedR.value);
        }
        done = true;
      } else {
        parenDepth = updateParenDepth(tk, parenDepth);
        const consumedR = consumeTokenOrError(parser);
        if (!consumedR.ok) return consumedR;
        out.push(consumedR.value);
      }
    }
  }
  if (out.length === 0)
    return err({ type: "InvalidInput", message: "Missing function body" });
  return ok(out);
}

function consumeFnKeyword(parser: ParserLike): Result<void, InterpretError> {
  const fnTok = parser.consume();
  if (!fnTok || fnTok.type !== "id" || fnTok.value !== "fn") {
    return err({ type: "InvalidInput", message: "Expected fn" });
  }
  return ok(undefined);
}

function consumeFunctionName(parser: ParserLike): Result<string, InterpretError> {
  const nameTok = parser.consume();
  if (!nameTok || nameTok.type !== "id") {
    return err({
      type: "InvalidInput",
      message: "Expected identifier after fn",
    });
  }
  return ok(nameTok.value);
}

function expectOpenParen(parser: ParserLike): Result<void, InterpretError> {
  const open = parser.consume();
  if (!open || open.type !== "op" || open.value !== "(") {
    return err({
      type: "InvalidInput",
      message: "Expected ( after function name",
    });
  }
  return ok(undefined);
}

function collectFunctionBodyTokens(
  parser: ParserLike
): Result<Token[], InterpretError> {
  const next = parser.peek();
  if (next && next.type === "op" && next.value === "{") {
    return collectBlockTokens(parser);
  }
  return collectExpressionTokens(parser);
}

export function parseFunctionDeclaration(
  parser: ParserLike
): Result<Value, InterpretError> {
  const fnR = consumeFnKeyword(parser);
  if (!fnR.ok) return fnR;

  const nameR = consumeFunctionName(parser);
  if (!nameR.ok) return nameR;

  const openR = expectOpenParen(parser);
  if (!openR.ok) return openR;

  const paramsR = parseParamList(parser);
  if (!paramsR.ok) return paramsR;

  const retR = parseOptionalReturnType(parser);
  if (!retR.ok) return retR;

  const arrowR = expectArrow(parser);
  if (!arrowR.ok) return arrowR;

  const bodyTokensR = collectFunctionBodyTokens(parser);
  if (!bodyTokensR.ok) return err(bodyTokensR.error);

  const scopes = parser.getScopes();
  const top = scopes[scopes.length - 1];
  if (!top)
    return err({ type: "InvalidInput", message: "Invalid block scope" });

  const params = paramsR.value;
  const fv: FunctionValue = { type: "fn", params, body: bodyTokensR.value };

  const name = nameR.value;
  if (top.has(name))
    return err({ type: "InvalidInput", message: "Duplicate declaration" });

  top.set(name, fv);
  return ok(0);
}

function parseOptionalReturnType(
  parser: ParserLike
): Result<void, InterpretError> {
  const maybeColon = parser.peek();
  if (maybeColon && maybeColon.type === "op" && maybeColon.value === ":") {
    parser.consume();
    const typeTok = parser.consume();
    if (!typeTok || typeTok.type !== "id")
      return err({
        type: "InvalidInput",
        message: "Expected type name after :",
      });
  }
  return ok(undefined);
}

function expectArrow(parser: ParserLike): Result<void, InterpretError> {
  const a = parser.consume();
  if (!a || a.type !== "op" || a.value !== "=")
    return err({
      type: "InvalidInput",
      message: "Expected => in function declaration",
    });
  const b = parser.consume();
  if (!b || b.type !== "op" || b.value !== ">")
    return err({
      type: "InvalidInput",
      message: "Expected => in function declaration",
    });
  return ok(undefined);
}

