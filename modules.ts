import { interpretTuff } from "./index";
import { err, ok, type Result } from "./src/result";

/**
 * Interprets the entry modules in order, each from its source text, and returns the value of the last one.
 * Modules cannot import each other yet, so each entry is interpreted on its own.
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
  let value = 0;
  for (const name of entries) {
    const source = sources.get(name);
    if (source === undefined) {
      return err(
        `What: unknown module "${name}". Where: the entry list. Why: no source was given for it. Fix: add it to the sources.`,
      );
    }
    const outcome = interpretTuff(source);
    if (!outcome.ok) {
      return err(`In module "${name}": ${outcome.error}`);
    }
    value = outcome.value;
  }
  return ok(value);
}
