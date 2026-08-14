import { tokenize } from "./tokenizer";
import { Parser } from "./parser";
import { typeCheck } from "./type-checker";
import { evaluateStatements } from "./evaluator";
import { Environment } from "./environment";
import type { StructDef, TypeNode } from "./ast";

export function evaluateModules(
  moduleNames: string[],
  sources: Record<string, string>,
): number {
  const moduleSet = new Set(Object.keys(sources));
  const exports = new Map<string, Record<string, number>>();
  const fnExports = new Map<string, Record<string, () => number>>();
  const structExports = new Map<string, Record<string, StructDef>>();
  const typeAliasExports = new Map<string, Record<string, TypeNode>>();
  // First pass: collect exports from all modules
  for (const name of Object.keys(sources)) {
    const source = sources[name]!;
    const tokens = tokenize(source);
    const parser = new Parser(tokens, moduleSet);
    const statements = parser.parse();
    typeCheck(statements);
    const env = new Environment();
    const modExports: Record<string, number> = {};
    const modFnExports: Record<string, () => number> = {};
    const modStructExports: Record<string, StructDef> = {};
    const modTypeAliasExports: Record<string, TypeNode> = {};
    for (const stmt of statements) {
      if (stmt.type === "let" && stmt.exported) {
        modExports[stmt.name] = evaluateStatements([stmt.value], env);
      }
      if (stmt.type === "fn-def" && stmt.exported) {
        modFnExports[stmt.name] = () => evaluateStatements([stmt.body], env);
      }
      if (stmt.type === "struct-def" && stmt.exported) {
        modStructExports[stmt.name] = stmt;
      }
      if (stmt.type === "type-alias" && stmt.exported) {
        modTypeAliasExports[stmt.name] = stmt.typeNode;
      }
    }
    exports.set(name, modExports);
    fnExports.set(name, modFnExports);
    structExports.set(name, modStructExports);
    typeAliasExports.set(name, modTypeAliasExports);
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
    env.setModuleFnExports(Object.fromEntries(fnExports));
    env.setModuleStructExports(Object.fromEntries(structExports));
    env.setModuleTypeAliasExports(Object.fromEntries(typeAliasExports));
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
