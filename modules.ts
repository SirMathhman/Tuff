import { interpretTuff, parseStatements } from "./index";
import { describeUnsupported, skipSpaces } from "./src/lexing";
import { newCursor } from "./src/scope";
import { err, ok, type Result } from "./src/result";
import { type HostValue, type ModuleExports, type ModuleLoader, type Value } from "./src/types";

/**
 * Interprets one entry module from its source text, and returns its value. A module's path is a list of
 * segments; its source is keyed by the segments joined with "/".
 * A module reaches another module's exported values with "name.value", and each module is loaded once.
 *
 * @param entry - The path of the module to run, as segments such as ["parent", "main"]. There must be at least one.
 * @param sources - The source text of each module, keyed by module name.
 * @param hostModules - Native JavaScript modules the host supplies, keyed by name; "extern name" reads one.
 * @returns An Ok result with the last module's value, or an Err result naming the module that failed.
 */
export function interpretModules(
  entry: readonly string[],
  sources: ReadonlyMap<string, string>,
  hostModules: ReadonlyMap<string, ReadonlyMap<string, HostValue>> = new Map(),
): Result<number, string> {
  if (entry.length === 0) {
    return err("What: no module path. Where: the entry. Why: it is empty. Fix: give at least one segment.");
  }
  const cache = new Map<string, Result<ModuleExports, string>>();
  const loading = new Set<string>();
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
      const instance = interpretModule(source, loadModule, inputs);
      loading.delete(name);
      return instance.ok ? ok({ values: instance.value }) : err(`In module "${name}": ${instance.error}`);
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
    const loaded = interpretModule(source, loadModule, inputs);
    loading.delete(name);
    const result = loaded.ok ? ok({ values: loaded.value }) : err(`In module "${name}": ${loaded.error}`);
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
 * Interprets a module: its declarations and statements, with no final expression. Returns the
 * values it exports with "out let".
 *
 * @param source - The module's source text.
 * @param modules - Loads the modules this one imports by name.
 * @param inputs - The values passed to this module as inputs, by name.
 * @returns An Ok result with the exported values, or an Err result describing the first problem.
 */
export function interpretModule(
  source: string,
  modules: ModuleLoader,
  inputs: ReadonlyMap<string, Value>,
): Result<ReadonlyMap<string, Value>, string> {
  const cursor = newCursor(new Map(), modules, inputs);
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
  return ok(cursor.exported);
}
