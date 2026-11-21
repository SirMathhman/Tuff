import { interpretTuff, parseStatements } from "./index";
import { describeUnsupported, skipSpaces } from "./src/lexing";
import { newCursor } from "./src/scope";
import { err, ok, type Result } from "./src/result";
import { type FunctionDef, type HostValue, type ModuleExports, type ModuleLoader, type Value } from "./src/types";

/** What a module provides: its exported values, and its functions, which an expect/actual pair links. */
interface ModuleResult {
  readonly exports: ReadonlyMap<string, Value>;
  readonly functions: ReadonlyMap<string, FunctionDef>;
}

/** A module source together with the set it was declared in. */
interface SetEntry {
  readonly set: string;
  readonly source: string;
}

/** The role a module plays: "expect" declares functions, "actual" implements them, "plain" is neither. */
type Role = "expect" | "actual" | "plain" | "both";

/**
 * Interprets one entry module from its source text, and returns its value. A module's path is a list of
 * segments; its source is keyed by the segments joined with "/".
 * A module reaches another module's exported values with "name.value", and each module is loaded once.
 *
 * @param entry - The path of the module to run, as segments such as ["parent", "main"]. There must be at least one.
 * @param sources - The source text of each module, keyed by module name.
 * @param hostModules - Native JavaScript modules the host supplies, keyed by name; "extern name" reads one.
 * @param actuals - For a module declared as expect in sources, its actual side, keyed by name.
 * @returns An Ok result with the last module's value, or an Err result naming the module that failed.
 */
export function interpretModules(
  entry: readonly string[],
  sources: ReadonlyMap<string, string>,
  hostModules: ReadonlyMap<string, ReadonlyMap<string, HostValue>> = new Map(),
  actuals: ReadonlyMap<string, string> = new Map(),
): Result<number, string> {
  if (entry.length === 0) {
    return err("What: no module path. Where: the entry. Why: it is empty. Fix: give at least one segment.");
  }
  const cache = new Map<string, Result<ModuleExports, string>>();
  const loading = new Set<string>();
  const loadPair = (name: string, expectSource: string, actualSource: string): Result<ModuleExports, string> => {
    const actualLoaded = interpretModule(actualSource, loadModule, new Map(), new Map());
    if (!actualLoaded.ok) {
      return err(`In module "${name}" (actual side): ${actualLoaded.error}`);
    }
    const { value: actualResult } = actualLoaded;
    const expectLoaded = interpretModule(expectSource, loadModule, new Map(), actualResult.functions);
    if (!expectLoaded.ok) {
      return err(`In module "${name}" (expect side): ${expectLoaded.error}`);
    }
    const { value: expectResult } = expectLoaded;
    const { functions: expectFunctions } = expectResult;
    for (const [fnName, actualFn] of actualResult.functions) {
      if (expectFunctions.get(fnName) !== actualFn) {
        return err(
          `What: actual fn "${fnName}" in module "${name}". Where: the actual side. Why: no expect fn matches it. Fix: declare it with expect fn in the other set, or remove it.`,
        );
      }
    }
    return ok({ values: new Map([...actualResult.exports, ...expectResult.exports]) });
  };
  const loadModule: ModuleLoader = (name, native, inputs) => {
    if (native) {
      return nativeExports(hostModules, name);
    }
    const source = sources.get(name);
    if (inputs.size > 0) {
      if (source === undefined) {
        return undefined;
      }
      if (loading.has(name)) {
        return err(
          `What: import cycle through "${name}". Where: the imports. Why: "${name}" depends on itself. Fix: break the cycle.`,
        );
      }
      loading.add(name);
      const instance = interpretModule(source, loadModule, inputs, new Map());
      loading.delete(name);
      return instance.ok ? ok(asExports(instance.value)) : err(`In module "${name}": ${instance.error}`);
    }
    const cached = cache.get(name);
    if (cached !== undefined) {
      return cached;
    }
    if (source === undefined) {
      return undefined;
    }
    if (loading.has(name)) {
      return err(
        `What: import cycle through "${name}". Where: the imports. Why: "${name}" depends on itself. Fix: break the cycle.`,
      );
    }
    loading.add(name);
    const actualSource = actuals.get(name);
    let result: Result<ModuleExports, string>;
    if (actualSource !== undefined) {
      result = loadPair(name, source, actualSource);
    } else {
      const loaded = interpretModule(source, loadModule, inputs, new Map());
      result = loaded.ok ? ok(asExports(loaded.value)) : err(`In module "${name}": ${loaded.error}`);
    }
    loading.delete(name);
    cache.set(name, result);
    return result;
  };
  const name = entry.join("/");
  const source = sources.get(name);
  if (source === undefined) {
    return err(
      `What: unknown module "${name}". Where: the entry path. Why: no source was given for it. Fix: add it to the sources under that path.`,
    );
  }
  loading.add(name);
  const outcome = interpretTuff(source, new Map(), loadModule);
  loading.delete(name);
  if (!outcome.ok) {
    return err(`In module "${name}": ${outcome.error}`);
  }
  return ok(outcome.value);
}

/**
 * Exposes a native JavaScript module. Numbers and booleans are readable values, and read live from the host;
 * functions are reached through "declare fn".
 *
 * @param hostModules - The native modules the host supplies, keyed by name.
 * @param name - The module name.
 * @returns The module's exports, or undefined if there is no such native module.
 */
function nativeExports(
  hostModules: ReadonlyMap<string, ReadonlyMap<string, HostValue>>,
  name: string,
): Result<ModuleExports, string> | undefined {
  const native = hostModules.get(name);
  if (native === undefined) {
    return undefined;
  }
  const values = new Map<string, Value>();
  for (const [field, value] of native) {
    if (typeof value !== "function") {
      values.set(field, value);
    }
  }
  return ok({ values, live: (field) => native.get(field) });
}

/**
 * Interprets a module: its declarations and statements, with no final expression. Returns its exported values
 * and its functions.
 *
 * @param source - The module's source text.
 * @param modules - Loads the modules this one imports by name.
 * @param inputs - The values passed to this module as inputs, by name.
 * @param linked - The functions the other side of an expect/actual pair provides, by name.
 * @returns An Ok result with the module's exports and functions, or an Err result describing the first problem.
 */
export function interpretModule(
  source: string,
  modules: ModuleLoader,
  inputs: ReadonlyMap<string, Value>,
  linked: ReadonlyMap<string, FunctionDef>,
): Result<ModuleResult, string> {
  const cursor = newCursor(new Map(), modules, inputs, linked);
  const problem = parseStatements(source, cursor);
  if (problem !== undefined) {
    return err(describeUnsupported(source, problem));
  }
  skipSpaces(source, cursor);
  if (cursor.pos < source.length) {
    return err(describeUnsupported(source, { offset: cursor.pos, expected: "a declaration or the end of the module" }));
  }
  const { inputsUsed } = cursor;
  for (const key of inputs.keys()) {
    if (!inputsUsed.has(key)) {
      return err(describeUnsupported(source, { offset: 0, expected: `an "in let ${key}" declaration in the module` }));
    }
  }
  const { scope } = cursor;
  const { functions } = scope;
  return ok({ exports: cursor.exported, functions });
}

/**
 * Interprets an entry module from a set of module sources. The sets form one namespace: a module in any set can
 * be used by its plain name from any other. A module name may appear in only one set, unless it appears exactly
 * twice as an "expect" and an "actual" module.
 *
 * @param setName - The name of the set the program starts from; it must exist.
 * @param entry - The path of the module to run, as segments.
 * @param sets - Each set's module sources, keyed by set name and then by module path.
 * @param hostModules - Native JavaScript modules the host supplies, keyed by name.
 * @returns An Ok result with the module's value, or an Err result describing the problem.
 */
export function interpretModuleSets(
  setName: string,
  entry: readonly string[],
  sets: ReadonlyMap<string, ReadonlyMap<string, string>>,
  hostModules: ReadonlyMap<string, ReadonlyMap<string, HostValue>> = new Map(),
): Result<number, string> {
  if (!sets.has(setName)) {
    return err(
      `What: unknown module set "${setName}". Where: the set name. Why: no set has that name. Fix: add the set to the sets.`,
    );
  }
  const byName = new Map<string, SetEntry[]>();
  for (const [set, sources] of sets) {
    for (const [name, source] of sources) {
      const entries = byName.get(name) ?? [];
      entries.push({ set, source });
      byName.set(name, entries);
    }
  }
  const merged = new Map<string, string>();
  const actuals = new Map<string, string>();
  for (const [name, entries] of byName) {
    const [first, second] = entries;
    if (first !== undefined && entries.length === 1 && roleOf(first.source) === "plain") {
      merged.set(name, first.source);
      continue;
    }
    if (first === undefined || second === undefined || entries.length !== 2) {
      return err(
        `What: module "${name}" appears in ${entries.length} set(s). Where: the sets. Why: a module name may repeat only as one expect and one actual. Fix: keep one copy, or make one expect and one actual.`,
      );
    }
    const firstRole = roleOf(first.source);
    const secondRole = roleOf(second.source);
    const paired =
      (firstRole === "expect" && secondRole === "actual") || (firstRole === "actual" && secondRole === "expect");
    if (!paired) {
      return err(
        `What: module "${name}" is in sets "${first.set}" and "${second.set}". Where: the sets. Why: a module name may repeat only as one expect and one actual. Fix: rename one of them.`,
      );
    }
    merged.set(name, firstRole === "expect" ? first.source : second.source);
    actuals.set(name, firstRole === "actual" ? first.source : second.source);
  }
  return interpretModules(entry, merged, hostModules, actuals);
}

/**
 * Turns a module's result into the exports the loader hands out.
 *
 * @param result - The module's exports and functions.
 * @returns The exported values.
 */
function asExports(result: ModuleResult): ModuleExports {
  return { values: result.exports };
}

/**
 * Removes comments, so keywords inside them are not mistaken for declarations.
 *
 * @param source - The module's source text.
 * @returns The source with comments replaced by spaces.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/**
 * Works out the role a module plays from the declarations it contains.
 *
 * @param source - The module's source text.
 * @returns "expect" if it declares expect fn, "actual" if it declares actual fn, "both" if it declares both, otherwise "plain".
 */
function roleOf(source: string): Role {
  const code = stripComments(source);
  const expects = /(^|[^A-Za-z0-9_])expect\s+fn\b/.test(code);
  const actualDeclared = /(^|[^A-Za-z0-9_])actual\s+fn\b/.test(code);
  if (expects && actualDeclared) {
    return "both";
  }
  if (expects) {
    return "expect";
  }
  return actualDeclared ? "actual" : "plain";
}
