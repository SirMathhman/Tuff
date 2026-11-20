import { err, ok, type Result } from "./src/result";

/**
 * Interprets a Tuff program and returns its result.
 *
 * @param tuffSource - The Tuff source text to interpret.
 * @returns An Ok result with the numeric result of the program, or an Err result describing why the source is not supported.
 */
export function interpretTuff(tuffSource: string): Result<number, string> {
  const source = tuffSource.trim();
  if (/^\d+$/.test(source)) {
    return ok(Number(source));
  }
  return err(`Unsupported Tuff source: ${tuffSource}`);
}
