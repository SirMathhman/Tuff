import { tokenize, parse, evalAst, toNum } from "./src";
import { compileAst, referencesArgs } from "./src/codegen";
import { ModuleLoader } from "./src/modules";

export function evaluate(source: string, args: string[] = []): number {
  const trimmed = source.trim();
  if (trimmed === "") return 0;
  const tokens = tokenize(trimmed);
  const ast = parse(tokens);
  const value = evalAst(ast, {
    scopes: [{ vars: {}, mutable: {} }],
    mutables: [{}],
    moduleInputs: {
      args: {
        tag: "array",
        values: args.map((a) => ({ tag: "string", value: a })),
      },
    },
  });
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

export function compile(source: string): string {
  const trimmed = source.trim();
  if (trimmed === "") return "process.exit(0);";
  const ast = parse(tokenize(trimmed));
  // Programs that don't read `args` constant-fold to an exit code.
  // Programs that do reference `args` get real JS with `args` as a free variable.
  if (!referencesArgs(ast)) {
    const value = evalAst(ast, {
      scopes: [{ vars: {}, mutable: {} }],
      mutables: [{}],
      moduleInputs: { args: { tag: "array", values: [] } },
    });
    return "process.exit(" + toNum(value) + ");";
  }
  return compileAst(ast);
}
