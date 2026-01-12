/**
 * Stubbed compiler and interpreter utilities
 *
 * Note: `interpret` uses `eval`. Only pass trusted input.
 */

/**
 * Compile a source string to JavaScript. (Stubbed)
 * @param source - source string to compile
 * @returns compiled JavaScript as a string
 */
export function compile(source: string): string {
  // Small compiler: support numeric literals with unsigned suffixes like `U8`.
  // Example: `100U8` -> `100`
  const s = source.trim();
  const lower = s.toLowerCase();

  // Handle `U8` suffix without using regex
  if (lower.endsWith("u8")) {
    const numPart = s.slice(0, s.length - 2).trim();
    if (numPart.length > 0) {
      // ensure all characters are digits
      let allDigits = true;
      for (let i = 0; i < numPart.length; i++) {
        const ch = numPart[i];
        if (ch < "0" || ch > "9") {
          allDigits = false;
          break;
        }
      }
      if (allDigits) return numPart;
    }
  }

  // If the source is a plain numeric literal (integer or float) return as-is
  function isNumericString(x: string): boolean {
    if (x.length === 0) return false;
    let i = 0;
    if (x[0] === "+" || x[0] === "-") i = 1;
    let hasDigits = false;
    let hasDot = false;
    for (; i < x.length; i++) {
      const ch = x[i];
      if (ch === ".") {
        if (hasDot) return false;
        hasDot = true;
        continue;
      }
      if (ch >= "0" && ch <= "9") {
        hasDigits = true;
        continue;
      }
      return false;
    }
    return hasDigits;
  }

  if (isNumericString(s)) return s;

  // Default: return the source unchanged
  return source;
}

/**
 * Interpret a source string by compiling and evaluating it with provided stdin.
 * @param source - source string to interpret
 * @param stdIn - standard input string made available to the evaluated code (optional)
 * @returns numeric result of evaluating the compiled source
 */
export function interpret(source: string, _stdIn: string = ""): number {
  // Avoid using `eval` or Function constructors (disallowed by lint). Rely on the
  // compiler to turn known patterns into numeric strings and just coerce here.
  const compiled = compile(source);
  const value = Number(compiled);
  if (Number.isNaN(value)) {
    throw new Error("Compiled output is not numeric and dynamic evaluation is disabled");
  }
  return value;
}
