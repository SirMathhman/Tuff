import { interpretModule, interpretTuff } from "./index";
import { err, ok, type Result } from "./src/result";
import { type HostValue, type ModuleExports, type ModuleLoader, type Value } from "./src/types";

/**
 * Interprets the entry modules in order, each from its source text, and returns the value of the last one.
 * A module reaches another module's exported values with "name.value", and each module is loaded once.
 *
 * @param entries - The names of the modules to run, in order. There must be at least one.
 * @param sources - The source text of each module, keyed by module name.
 * @param hostModules - Native JavaScript modules the host supplies, keyed by name; "extern name" reads one.
 * @returns An Ok result with the last module's value, or an Err result naming the module that failed.
 */
export function interpretModules(
  entries: readonly string[],
  sources: ReadonlyMap<string, string>,
  hostModules: ReadonlyMap<string, ReadonlyMap<string, HostValue>> = new Map(),
): Result<number, string> {
  if (entries.length === 0) {
    return err("What: no modules to run. Where: the entry list. Why: it is empty. Fix: list at least one module name.");
  }
  const cache = new Map<string, Result<ModuleExports, string>>();
  const loading = new Set<string>();
  const loadModule: ModuleLoader = (name, native) => {
    if (native) {
      return nativeExports(hostModules, name);
    }
    const cached = cache.get(name);
    if (cached !== undefined) {
      return cached;
    }
    const source = sources.get(name);
    if (source === undefined) {
      return undefined;
    }
    if (loading.has(name)) {
      return err(
        `What: import cycle through "${name}". Where: the imports. Why: "${name}" depends on itself. Fix: break the cycle.`,
      );
    }
    loading.add(name);
    const loaded = interpretModule(source, loadModule);
    loading.delete(name);
    const result = loaded.ok ? ok({ values: loaded.value }) : err(`In module "${name}": ${loaded.error}`);
    cache.set(name, result);
    return result;
  };
  let value = 0;
  for (const name of entries) {
    const source = sources.get(name);
    if (source === undefined) {
      return err(
        `What: unknown module "${name}". Where: the entry list. Why: no source was given for it. Fix: add it to the sources.`,
      );
    }
    loading.add(name);
    const outcome = interpretTuff(source, new Map(), loadModule);
    loading.delete(name);
    if (!outcome.ok) {
      return err(`In module "${name}": ${outcome.error}`);
    }
    value = outcome.value;
  }
  return ok(value);
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
