import { lex } from "./src/lexer";
import { parse } from "./src/parser";
import { evaluate } from "./src/evaluator";
import { isBool } from "./src/value";
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
  if (isBool(value)) {
    return value.value ? 1 : 0;
  }
  if (value === true) {
    return 1;
  }
  if (value === false) {
    return 0;
  }
  if (typeof value === "object" && "value" in value) {
    return value.value;
  }
  if (typeof value === "number") {
    return value;
  }
  return 0;
}
