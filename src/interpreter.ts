/**
 * Stubbed compiler and interpreter utilities
 *
 * Note: `interpret` uses `eval`. Only pass trusted input.
 */

function isAllDigits(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch < "0" || ch > "9") return false;
  }
  return s.length > 0;
}

function handleU8(s: string): string | undefined {
  const lower = s.toLowerCase();
  if (!lower.endsWith("u8")) return undefined;

  const numPart = s.slice(0, s.length - 2).trim();
  if (!isAllDigits(numPart)) return undefined;

  const val = Number(numPart);
  if (val > 255) return undefined;

  return numPart;
}

// If the source is a plain numeric literal (integer or float) return as-is
function isNumericString(x: string): boolean {
  if (x.length === 0) return false;
  let i = x[0] === "+" || x[0] === "-" ? 1 : 0;
  let hasDigits = false;
  let hasDot = false;
  for (; i < x.length; i++) {
    const ch = x[i];
    const isDot = ch === ".";
    const isDigit = ch >= "0" && ch <= "9";

    if (isDot && hasDot) return false;
    if (isDot) hasDot = true;
    if (isDigit) hasDigits = true;
    if (!isDot && !isDigit) return false;
  }
  return hasDigits;
}

/**
 * Compile a source string to JavaScript. (Stubbed)
 * @param source - source string to compile
 * @returns compiled JavaScript as a string
 */
export function compile(source: string): string {
  const s = source.trim();

  const u8Result = handleU8(s);
  if (u8Result !== undefined) return u8Result;

  if (isNumericString(s)) return s;

  return source;
}

/**
 * Simple Result type for error handling
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/**
 * Interpret a source string by compiling and evaluating it with provided stdin.
 * @param source - source string to interpret
 * @param stdIn - standard input string made available to the evaluated code (optional)
 * @returns numeric result of evaluating the compiled source wrapped in a Result
 */
export function interpret(
  source: string,
  _stdIn: string = ""
): Result<number, Error> {
  // Avoid using `eval` or Function constructors (disallowed by lint). Rely on the
  // compiler to turn known patterns into numeric strings and just coerce here.
  const compiled = compile(source);
  const value = Number(compiled);
  if (Number.isNaN(value)) {
    return err(
      new Error(
        "Compiled output is not numeric and dynamic evaluation is disabled"
      )
    );
  }
  return ok(value);
}
