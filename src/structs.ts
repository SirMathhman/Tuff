import {
  Result,
  InterpretError,
  Token,
  ok,
  err,
  StructInstance,
  Value,
} from "./types";

interface ParserLike {
  peek(): Token | undefined;
  consume(): Token | undefined;
  parseExpr(): Result<Value, InterpretError>;
  lookupVar(name: string): Value | undefined;
}

export function parseStructField(
  parser: ParserLike
): Result<string, InterpretError> {
  const fieldTok = parser.consume();
  if (!fieldTok || fieldTok.type !== "id")
    return err({
      type: "InvalidInput",
      message: "Expected field name in struct body",
    });

  const name = fieldTok.value;
  const colon = parser.peek();
  if (!colon || colon.type !== "op" || colon.value !== ":")
    return err({
      type: "InvalidInput",
      message: "Expected : after field name",
    });
  parser.consume(); // consume ':'

  const typeTok = parser.consume();
  if (!typeTok || typeTok.type !== "id")
    return err({ type: "InvalidInput", message: "Expected type name after :" });

  return ok(name);
}

export function parseStructFields(
  parser: ParserLike
): Result<string[], InterpretError> {
  const seen = new Set<string>();
  const fields: string[] = [];
  while (true) {
    const p = parser.peek();
    if (!p)
      return err({ type: "InvalidInput", message: "Missing closing brace" });

    if (p.type === "op" && p.value === "}") {
      parser.consume();
      return ok(fields);
    }

    if (p.type === "op" && (p.value === ";" || p.value === ",")) {
      parser.consume();
    } else {
      const fR = parseStructField(parser);
      if (!fR.ok) return fR;
      if (seen.has(fR.value))
        return err({
          type: "InvalidInput",
          message: "Duplicate field declaration",
        });
      seen.add(fR.value);
      fields.push(fR.value);

      const maybeSep = parser.peek();
      if (
        maybeSep &&
        maybeSep.type === "op" &&
        (maybeSep.value === ";" || maybeSep.value === ",")
      )
        parser.consume();
    }
  }
}

export function parseStructLiteral(
  parser: ParserLike,
  typeDef: string[]
): Result<StructInstance, InterpretError> {
  const open = parser.consume();
  if (!open || open.type !== "op" || open.value !== "{")
    return err({
      type: "InvalidInput",
      message: "Missing opening brace in struct literal",
    });

  const inst = new Map<string, number>();
  for (let i = 0; i < typeDef.length; i++) {
    const exprR = parser.parseExpr();
    if (!exprR.ok) return exprR;
    if (typeof exprR.value !== "number")
      return err({
        type: "InvalidInput",
        message: "Struct field initializer must be numeric",
      });
    const num = exprR.value;
    inst.set(typeDef[i], num);
    const sep = parser.peek();
    if (sep && sep.type === "op" && (sep.value === "," || sep.value === ";"))
      parser.consume();
  }

  const closing = parser.consume();
  if (!closing || closing.type !== "op" || closing.value !== "}")
    return err({
      type: "InvalidInput",
      message: "Missing closing brace in struct literal",
    });

  return ok(inst);
}

export function parseMemberAccess(
  parser: ParserLike,
  varName: string
): Result<Value, InterpretError> {
  // consume identifier
  parser.consume();
  const dot = parser.consume();
  if (!dot || dot.type !== "op" || dot.value !== ".")
    return err({
      type: "InvalidInput",
      message: "Expected . in member access",
    });
  const fieldTok = parser.consume();
  if (!fieldTok || fieldTok.type !== "id")
    return err({
      type: "InvalidInput",
      message: "Expected field name after .",
    });
  const v = parser.lookupVar(varName);
  if (v === undefined)
    return err({ type: "UndefinedIdentifier", identifier: varName });
  if (!(v instanceof Map))
    return err({
      type: "InvalidInput",
      message: "Attempting to access field on non-struct value",
    });
  const fv = v.get(fieldTok.value);
  if (typeof fv !== "number")
    return err({ type: "InvalidInput", message: "Unknown field" });
  return ok(fv);
}
