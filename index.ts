import { lex } from "./src/lexer";
import { parse } from "./src/parser";
import { evaluate } from "./src/evaluator";
import type { Value } from "./src/types";

export function interpret(source: string): number {
  if (source === "") {
    return 0;
  }
  const tokens = lex(source);
  const ast = parse(tokens);
  return toExitCode(evaluate(ast));
}

function toExitCode(value: Value): number {
  return value === true ? 1 : value === false ? 0 : value;
}
