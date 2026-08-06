import { tokenize } from "./src/tokenizer";
import { parse } from "./src/parser";
import { evalAst } from "./src/evaluator";
import { toNum } from "./src/values";

export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (trimmed === "") return 0;
  const tokens = tokenize(trimmed);
  const ast = parse(tokens);
  const value = evalAst(ast, [{ vars: {}, mutable: {} }], [{}]);
  return toNum(value);
}
