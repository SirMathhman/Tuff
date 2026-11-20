import { interpretModule, interpretTuff } from "./index";
import { err, ok, type Result } from "./src/result";
import { type ModuleLoader, type Value } from "./src/types";

/**
 * Interprets the entry modules in order, each from its source text, and returns the value of the last one.
 * A module reaches another module's exported values with "name.value", and each module is loaded once.
 *
 * @param entries - The names of the modules to run, in order. There must be at least one.
 * @param sources - The source text of each module, keyed by module name.
 * @returns An Ok result with the last module's value, or an Err result naming the module that failed.
 */
export function interpretModules(
  entries: readonly string[],
  sources: ReadonlyMap<string, string>,
): Result<number, string> {
  if (entries.length === 0) {
    return err("What: no modules to run. Where: the entry list. Why: it is empty. Fix: list at least one module name.");
  }
  const cache = new Map<string, Result<ReadonlyMap<string, Value>, string>>();
  const loading = new Set<string>();
  const loadModule: ModuleLoader = (name) => {
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
    const result = loaded.ok ? loaded : err(`In module "${name}": ${loaded.error}`);
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
