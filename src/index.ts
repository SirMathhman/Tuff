import { tokenize } from "./tokenizer";
import { Parser } from "./parser";
import { typeCheck } from "./type-checker";
import { evaluateStatements } from "./evaluator";
import { Environment } from "./environment";

export function evaluate(source: string): number {
  if (source === "") return 0;

  const tokens = tokenize(source);
  const parser = new Parser(tokens);
  const statements = parser.parse();
  typeCheck(statements);
  const env = new Environment();
  return evaluateStatements(statements, env);
}
