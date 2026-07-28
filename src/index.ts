import { tokenize } from "./tokenizer";
import { parse } from "./parser";
import { evaluate } from "./evaluator";

export function interpret(source: string): number {
  const trimmed = source.trim();
  if (trimmed === "") {
    return 0;
  }
  const tokens = tokenize(trimmed);
  if (tokens.length === 0) {
    return 0;
  }
  const ast = parse(tokens);
  return evaluate(ast);
}
