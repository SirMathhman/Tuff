import { tokenize, parse, evalAst, toNum } from "./src";
import { ModuleLoader } from "./src/modules";

export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (trimmed === "") return 0;
  const tokens = tokenize(trimmed);
  const ast = parse(tokens);
  const value = evalAst(ast, [{ vars: {}, mutable: {} }], [{}]);
  return toNum(value);
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
