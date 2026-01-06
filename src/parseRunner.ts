import { Result, InterpretError, Value, ok, err } from "./types";
import { parseStatement } from "./statements";

import { ParserLike } from "./parserInterfaces";

export function runParser(parser: ParserLike): Result<Value, InterpretError> {
  // empty token stream represents an empty or whitespace-only input -> 0
  if (!parser.peek()) return ok(0);

  parser.pushScope();
  let lastVal: Value = 0;

  while (parser.peek()) {
    const stmtR = parseStatement(parser, true);
    if (!stmtR.ok) {
      parser.popScope();
      return stmtR;
    }
    lastVal = stmtR.value;
  }

  parser.popScope();

  if (typeof lastVal === "number" && !Number.isFinite(lastVal))
    return err({ type: "InvalidInput", message: "Unable to interpret input" });
  return ok(lastVal);
}
