import { tokenize } from "./lexer/tokenizer";
import { parse } from "./parser/parser";
import { analyze } from "./analyzer/analyzer";
import { evaluate } from "./eval/evaluator";
import { toNumber, unwrap } from "./eval/value";

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
  return toNumber(unwrap(evaluate(ast)));
}
