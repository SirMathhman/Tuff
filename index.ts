import { tokenize } from "./tokenizer";
import { parse } from "./parser";
import { evaluateProgram } from "./evaluator";

export function evaluate(source: string): number {
  const tokens = tokenize(source);
  if (tokens.length === 0) {
    return 0;
  }
  return evaluateProgram(parse(tokens));
}
