import { tokenize } from "./tokenizer";
import { parse } from "./parser";
import { analyze } from "./analyzer";
import { optimize } from "./optimizer";
import { evaluate } from "./evaluator";
import { toNumber, unwrap } from "./value";

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
  analyze(ast);
  optimize(ast);
  return toNumber(unwrap(evaluate(ast)));
}
