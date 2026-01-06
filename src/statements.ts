import {
  Result,
  InterpretError,
  Value,
  Token,
  ok,
  err,
  ReturnSignalValue,
} from "./types";

interface ParserLike {
  peek(): Token | undefined;
  peekNext(): Token | undefined;
  consume(): Token | undefined;
  parseExpr(): Result<Value, InterpretError>;
  parseStructDeclaration(): Result<Value, InterpretError>;
  parseLetDeclaration(): Result<Value, InterpretError>;
  parseFunctionDeclaration(): Result<Value, InterpretError>;
  assignVar(name: string, value: Value): Result<Value, InterpretError>;
  pushScope(): void;
  popScope(): void;
}

function handleIdToken(
  parser: ParserLike,
  p: Token
): Result<Value, InterpretError> | undefined {
  if (p.type !== "id") return undefined;
  if (p.value === "struct") {
    const sR = parser.parseStructDeclaration();
    if (!sR.ok) return sR;
    return ok(sR.value);
  }
  if (p.value === "let") {
    const declR = parser.parseLetDeclaration();
    if (!declR.ok) return declR;
    return ok(declR.value);
  }
  if (p.value === "fn") {
    const fR = parser.parseFunctionDeclaration();
    if (!fR.ok) return fR;
    return ok(fR.value);
  }

  if (p.value === "yield") {
    // consume 'yield' and evaluate expression, then return a return-signal value
    parser.consume();
    const exprR = parser.parseExpr();
    if (!exprR.ok) return exprR;
    if (typeof exprR.value !== "number")
      return err({
        type: "InvalidInput",
        message: "Yield expression must be numeric",
      });
    const next = parser.peek();
    if (next && next.type === "op" && next.value === ";") parser.consume();
    return ok({ type: "return", value: exprR.value });
  }

  return undefined;
}

function tryHandleAssignment(parser: ParserLike, p: Token): Result<Value, InterpretError> | undefined {
  if (p.type !== "id") return undefined;
  const next = parser.peekNext();
  if (!next || next.type !== "op" || next.value !== "=") return undefined;

  const varName = p.value;
  parser.consume(); // consume identifier
  parser.consume(); // consume '='
  const rhs = parser.parseExpr();
  if (!rhs.ok) return rhs;
  const semi = parser.peek();
  if (semi && semi.type === "op" && semi.value === ";") parser.consume();
  const assignR = parser.assignVar(varName, rhs.value);
  if (!assignR.ok) return assignR;
  return ok(assignR.value);
}

export function parseStatement(
  parser: ParserLike,
  allowEof: boolean
): Result<Value, InterpretError> {
  const p = parser.peek();
  if (!p)
    return err({ type: "InvalidInput", message: "Unable to interpret input" });

  const idR = handleIdToken(parser, p);
  if (idR !== undefined) return idR;

  // assignment handling delegated to a helper to reduce complexity
  const assignR = tryHandleAssignment(parser, p);
  if (assignR !== undefined) return assignR;

  const exprR = parser.parseExpr();
  if (!exprR.ok) return exprR;
  const val = exprR.value;

  const next = parser.peek();
  if (next && next.type === "op") {
    if (next.value === ";") {
      parser.consume();
      return ok(val);
    }
    if (next.value === "}") return ok(val);
  }

  if (!next && allowEof) return ok(val);

  return err({
    type: "InvalidInput",
    message: "Unexpected token in statement",
  });
}

function skipToMatchingBrace(parser: ParserLike): Result<void, InterpretError> {
  // consumes tokens until the matching closing brace (handles nested braces)
  let depth = 0;
  for (;;) {
    const t = parser.peek();
    if (!t)
      return err({ type: "InvalidInput", message: "Missing closing brace" });
    if (t.type === "op" && t.value === "{") {
      depth++;
      parser.consume();
    } else if (t.type === "op" && t.value === "}") {
      if (depth === 0) {
        parser.consume();
        return ok(undefined);
      }
      depth--;
      parser.consume();
    } else {
      parser.consume();
    }
  }
}

export function parseBraced(parser: ParserLike): Result<Value, InterpretError> {
  // assume current token is '{'
  parser.consume();
  parser.pushScope();
  let lastVal: Value = 0;

  for (;;) {
    const p = parser.peek();
    if (!p) {
      parser.popScope();
      return err({ type: "InvalidInput", message: "Missing closing brace" });
    }

    if (p.type === "op" && p.value === "}") {
      parser.consume();
      parser.popScope();
      return ok(lastVal);
    }

    const stmtR = parseStatement(parser, false);
    if (!stmtR.ok) {
      parser.popScope();
      return stmtR;
    }
    // propagate return signals immediately: skip to matching closing brace then return
    if (typeof stmtR.value === "object") {
      // eslint-disable-next-line no-restricted-syntax
      if ((stmtR.value as ReturnSignalValue).type === "return") {
        const skip = skipToMatchingBrace(parser);
        if (!skip.ok) return skip;
        parser.popScope();
        return ok(stmtR.value);
      }
    }
    lastVal = stmtR.value;
  }
}

export function parseIfExpression(
  parser: ParserLike
): Result<Value, InterpretError> {
  // assume current token is 'if'
  parser.consume();
  const open = parser.consume();
  if (!open || open.type !== "op" || open.value !== "(")
    return err({ type: "InvalidInput", message: "Expected ( after if" });
  const cond = parser.parseExpr();
  if (!cond.ok) return cond;
  if (typeof cond.value !== "number")
    return err({ type: "InvalidInput", message: "Condition must be numeric" });
  const close = parser.consume();
  if (!close || close.type !== "op" || close.value !== ")")
    return err({ type: "InvalidInput", message: "Expected ) after condition" });
  const cons = parser.parseExpr();
  if (!cons.ok) return cons;
  const e = parser.consume();
  if (!e || e.type !== "id" || e.value !== "else")
    return err({
      type: "InvalidInput",
      message: "Expected else in conditional",
    });
  const alt = parser.parseExpr();
  if (!alt.ok) return alt;
  return ok(cond.value !== 0 ? cons.value : alt.value);
}
