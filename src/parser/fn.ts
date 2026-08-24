import { ErrorKind } from "../errors.ts";
import type { EvalError, Position } from "../errors.ts";
import type { Token } from "../lexer/index.ts";
import { Err, Ok } from "../result.ts";
import type { Result } from "../result.ts";
import { StatementType } from "../ast/index.ts";
import type { FnParam, ParsedBlock, Statement } from "../ast/index.ts";
import type { Parser } from "./parser.ts";

export function parseFnDecl(parser: Parser, t: Token): Result<Statement, EvalError> {
  parser.advance();
  const nameTok = parser.expect("identifier", "a function name");
  if (!nameTok.ok) return nameTok;
  const lparen = parser.expect("lparen", "'('");
  if (!lparen.ok) return lparen;
  const paramsResult = parseFnParams(parser);
  if (!paramsResult.ok) return paramsResult;
  const colon = parser.expect("colon", "':'");
  if (!colon.ok) return colon;
  const retTok = parser.expect("identifier", "a return type");
  if (!retTok.ok) return retTok;
  const arrow = parser.expect("operator", "'=>'");
  if (!arrow.ok) return arrow;
  if (parser.peek().kind !== "lbrace") {
    return Err(
      syntaxErr(
        `Expected '{' but found "${parser.peek().value || "end of input"}"`,
        parser.peek().position,
      ),
    );
  }
  const block: Result<ParsedBlock, EvalError> = parser.parseBlock(parser.peek());
  if (!block.ok) return block;
  return Ok({
    type: StatementType.FnDecl,
    name: nameTok.value.value,
    params: paramsResult.value,
    returnType: retTok.value.value,
    body: block.value.statements,
    position: t.position,
  });
}

function parseFnParams(parser: Parser): Result<FnParam[], EvalError> {
  const params: FnParam[] = [];
  if (parser.peek().kind === "rparen") {
    parser.advance();
    return Ok(params);
  }
  for (;;) {
    const nameTok = parser.expect("identifier", "a parameter name");
    if (!nameTok.ok) return nameTok;
    const colon = parser.expect("colon", "':'");
    if (!colon.ok) return colon;
    const typeTok = parser.expect("identifier", "a parameter type");
    if (!typeTok.ok) return typeTok;
    params.push({ name: nameTok.value.value, type: typeTok.value.value });
    const sep = parser.peek();
    if (sep.kind === "rparen") {
      parser.advance();
      return Ok(params);
    }
    if (sep.kind !== "comma") {
      return parser.commaError(sep);
    }
    parser.advance();
  }
}

function syntaxErr(message: string, position: Position): EvalError {
  return { kind: ErrorKind.Syntax, message, position, snippet: "" };
}
