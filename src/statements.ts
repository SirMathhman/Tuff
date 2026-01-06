import { Result, InterpretError, Value, Token, ok, err } from "./types";

interface ParserLike {
  peek(): Token | undefined;
  consume(): Token | undefined;
  parseExpr(): Result<Value, InterpretError>;
  parseStructDeclaration(): Result<Value, InterpretError>;
  parseLetDeclaration(): Result<Value, InterpretError>;
  pushScope(): void;
  popScope(): void;
}

export function parseStatement(
  parser: ParserLike,
  allowEof: boolean
): Result<Value, InterpretError> {
  const p = parser.peek();
  if (!p)
    return err({ type: "InvalidInput", message: "Unable to interpret input" });

  if (p.type === "id") {
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
  }

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

export function parseBraced(parser: ParserLike): Result<Value, InterpretError> {
  // assume current token is '{'
  parser.consume();
  parser.pushScope();
  let lastVal: Value = 0;

  while (true) {
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
