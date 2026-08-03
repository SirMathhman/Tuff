import { tokenize } from "./lexer";
import { parse } from "./parser";
import { evaluate } from "./evaluator";

export function interpret(source: string): number {
  const tokens = tokenize(source);
  if (tokens.length === 0) {
    return 0;
  }
  return evaluate(parse(tokens));
}
