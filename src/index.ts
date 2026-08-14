import { tokenize } from "./tokenizer";
import { Parser } from "./parser";
import { typeCheck } from "./type-checker";
import { evaluateStatements } from "./evaluator";
import { Environment } from "./environment";

export function evaluateModules(
  moduleNames: string[],
  sources: Record<string, string>,
): number {
  const moduleSet = new Set(Object.keys(sources));
  const exports = new Map<string, Record<string, number>>();
  // First pass: collect exports from all modules
  for (const name of Object.keys(sources)) {
    const source = sources[name]!;
    const tokens = tokenize(source);
    const parser = new Parser(tokens, moduleSet);
    const statements = parser.parse();
    typeCheck(statements);
    const env = new Environment();
    const modExports: Record<string, number> = {};
    for (const stmt of statements) {
      if (stmt.type === "let" && stmt.exported) {
        modExports[stmt.name] = evaluateStatements([stmt.value], env);
      }
    }
    exports.set(name, modExports);
  }
  // Second pass: evaluate with exports
  let result = 0;
  for (const name of moduleNames) {
    const source = sources[name]!;
    const tokens = tokenize(source);
    const parser = new Parser(tokens, moduleSet);
    const statements = parser.parse();
    const env = new Environment();
    env.setModuleExports(Object.fromEntries(exports));
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
