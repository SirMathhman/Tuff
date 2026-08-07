import { evalAst, parse, tokenize, toNum } from "./src";
import { analyze, newTypeEnv } from "./src/analyzer";
import { compileAst } from "./src/codegen";
import { ModuleLoader } from "./src/modules";
import type { Ast } from "./src/types";

// Parse + analyze a program: runs semantic analysis once, returning the
// AST and its TypeEnv for the evaluator or compiler to consume.
function analyzeProgram(
  source: string,
  moduleNames?: Set<string>,
): {
  ast: Ast;
  typeEnv: ReturnType<typeof newTypeEnv>;
} {
  const trimmed = source.trim();
  if (trimmed === "")
    return { ast: { kind: "num", value: 0 }, typeEnv: newTypeEnv() };
  const ast = parse(tokenize(trimmed));
  const typeEnv = newTypeEnv();
  analyze(ast, typeEnv, { moduleNames });
  return { ast, typeEnv };
}

// Build the eval context for a program (fresh scopes, args input, type env).
function evalContext(typeEnv: ReturnType<typeof newTypeEnv>, args: string[]) {
  return {
    scopes: [{ vars: {}, mutable: {} }],
    mutables: [{}],
    typeEnv,
    moduleInputs: {
      args: {
        tag: "array" as const,
        values: args.map((a) => ({ tag: "string" as const, value: a })),
      },
    },
  };
}

export function evaluate(source: string, args: string[] = []): number {
  const { ast, typeEnv } = analyzeProgram(source);
  if (ast.kind === "num") return 0; // empty/trivial source
  return toNum(evalAst(ast, evalContext(typeEnv, args)));
}

export function evaluateModules(
  entries: string[],
  modules: Record<string, string>,
): number {
  const loader = new ModuleLoader(modules);
  let result = 0;
  for (const name of entries) {
    result = loader.evaluateEntry(name);
  }
  return result;
}

export function compile(
  source: string,
  moduleNames?: Set<string>,
): string {
  const { ast, typeEnv } = analyzeProgram(source, moduleNames);
  return compileAst(ast, typeEnv, moduleNames);
}
