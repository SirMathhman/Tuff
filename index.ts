import { tokenize, parse, evalAst, toNum } from "./src";

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
  let result = 0;
  for (const name of entries) {
    const source = modules[name];
    if (source === undefined) throw new Error(`module not found: ${name}`);
    result = evaluate(source);
  }
  return result;
}
