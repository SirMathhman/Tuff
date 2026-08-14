import { tokenize } from "./tokenizer";
import { Parser } from "./parser";
import { typeCheck } from "./type-checker";
import { evaluateStatements } from "./evaluator";
import { Environment } from "./environment";

export function evaluateModules(
  moduleNames: string[],
  sources: Record<string, string>,
): number {
  let result = 0;
  for (const name of moduleNames) {
    const source = sources[name];
    if (!source) throw new Error(`Module not found: ${name}`);
    const tokens = tokenize(source);
    const parser = new Parser(tokens);
    const statements = parser.parse();
    typeCheck(statements);
    const env = new Environment();
    result = evaluateStatements(statements, env);
  }
  return result;
}

export function evaluate(source: string): number {
  if (source === "") return 0;

  const tokens = tokenize(source);
  const parser = new Parser(tokens);
  const statements = parser.parse();
  typeCheck(statements);
  const env = new Environment();
  return evaluateStatements(statements, env);
}
