import { tokenize, parse, evalAst, toNum, type Value } from "./src";

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
  const scopes = [{ vars: {}, mutable: {} }];
  const mutables = [{}];
  const loaded = new Set<string>();
  const moduleRecords: Record<string, Value> = {};

  function loadModule(name: string): Value | null {
    if (name in moduleRecords) return moduleRecords[name]!;
    const source = modules[name];
    if (source === undefined) return null;
    if (loaded.has(name)) throw new Error(`circular module dependency: ${name}`);
    loaded.add(name);
    const exports: Record<string, Value> = {};
    const tokens = tokenize(source);
    const ast = parse(tokens);
    evalAst(ast, scopes, mutables, exports, loadModule);
    const record = { tag: "record" as const, fields: exports };
    moduleRecords[name] = record;
    return record;
  }

  let result = 0;
  for (const name of entries) {
    const source = modules[name];
    if (source === undefined) throw new Error(`module not found: ${name}`);
    const exports: Record<string, Value> = {};
    const tokens = tokenize(source);
    const ast = parse(tokens);
    const value = evalAst(ast, scopes, mutables, exports, loadModule);
    result = toNum(value);
  }
  return result;
}
