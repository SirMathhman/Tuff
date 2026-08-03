import { tokenize } from "./tokens";
import { parse } from "./parser";
import { evalAst } from "./evaluator";
import { Env } from "./env";

export function evaluate(source: string): number {
  if (source === "") {
    return 0;
  }

  const tokens = tokenize(source);
  const ast = parse(tokens);
  return evalAst(ast, new Env());
}
