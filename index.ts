import { tokenize } from "./src/tokenize";
import { parse } from "./src/parse";
import { evaluateExpr } from "./src/evaluate";

export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (!trimmed) return 0;
  const tokens = tokenize(trimmed);
  const ast = parse(tokens);
  return evaluateExpr(ast);
}
