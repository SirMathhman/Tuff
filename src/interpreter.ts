import type { Scope } from "./scope";
import { createScope } from "./scope";
import { tokenize } from "./tokenizer";
import { parse } from "./parser";
import { evaluateProgram } from "./evaluator";

export function interpret(source: string): number {
  const tokens = tokenize(source);
  const ast = parse(tokens);
  const scopes: Scope[] = [createScope()];
  return evaluateProgram(ast, scopes);
}
