import { ErrorKind } from "../errors.ts";
import type { EvalError, Position } from "../errors.ts";
import type { Token, TokenKind } from "../lexer/index.ts";
import { Err, Ok } from "../result.ts";
import type { Result } from "../result.ts";
import { ExprType, StatementType } from "../ast/index.ts";
import type { Expr, Statement, StructField, StructFieldInit } from "../ast/index.ts";

/** The slice of the parser that struct parsing needs (avoids a type cycle). */
interface StructParser {
  peek(): Token;
  advance(): Token;
  expect(kind: TokenKind, what: string): Result<Token, EvalError>;
  parseExpr(): Result<Expr, EvalError>;
  commaError(sep: Token): Result<never, EvalError>;
}

function err(kind: ErrorKind, message: string, position: Position): EvalError {
  return { kind, message, position, snippet: "" };
}

export function parseStructDecl(p: StructParser, t: Token): Result<Statement, EvalError> {
  p.advance();
  const nameTok = p.expect("identifier", "a struct name");
  if (!nameTok.ok) return nameTok;
  if (p.peek().kind !== "lbrace") {
    return Err(
      err(
        ErrorKind.Syntax,
        `Expected '{' but found "${p.peek().value || "end of input"}"`,
        p.peek().position,
      ),
    );
  }
  const fields = parseStructFields(p);
  if (!fields.ok) return fields;
  return Ok({
    type: StatementType.StructDecl,
    name: nameTok.value.value,
    fields: fields.value,
    position: t.position,
  });
}

function parseStructFields(p: StructParser): Result<StructField[], EvalError> {
  p.advance();
  const fields: StructField[] = [];
  for (;;) {
    const nameTok = p.expect("identifier", "a field name");
    if (!nameTok.ok) return nameTok;
    const colon = p.expect("colon", "':'");
    if (!colon.ok) return colon;
    const typeTok = p.expect("identifier", "a field type");
    if (!typeTok.ok) return typeTok;
    fields.push({ name: nameTok.value.value, type: typeTok.value.value });
    const sep = p.peek();
    if (sep.kind === "rbrace") {
      p.advance();
      return Ok(fields);
    }
    if (sep.kind !== "comma") {
      return p.commaError(sep);
    }
    p.advance();
  }
}

export function parseStructLiteral(
  p: StructParser,
  name: string,
  position: Position,
): Result<Expr, EvalError> {
  p.advance();
  const fields: StructFieldInit[] = [];
  for (;;) {
    const nameTok = p.expect("identifier", "a field name");
    if (!nameTok.ok) return nameTok;
    const colon = p.expect("colon", "':'");
    if (!colon.ok) return colon;
    const value = p.parseExpr();
    if (!value.ok) return value;
    fields.push({ name: nameTok.value.value, value: value.value });
    const sep = p.peek();
    if (sep.kind === "rbrace") {
      p.advance();
      return Ok({ type: ExprType.Struct, structName: name, fields, position });
    }
    if (sep.kind !== "comma") {
      return p.commaError(sep);
    }
    p.advance();
  }
}
