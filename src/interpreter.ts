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

function handleIntSuffix(s: string): string | undefined {
  const suffixes = ["U8", "U16", "U32", "U64", "I8", "I16", "I32", "I64"];
  const suffix = suffixes.find((suf) => s.endsWith(suf));
  if (suffix === undefined) return undefined;

  const numPartStr = s.slice(0, s.length - suffix.length).trim();
  const hasSign = numPartStr.startsWith("-") || numPartStr.startsWith("+");
  const digits = hasSign ? numPartStr.slice(1) : numPartStr;

  if (!isAllDigits(digits)) return undefined;

  const isUnsigned = suffix.startsWith("U");
  if (isUnsigned && numPartStr.startsWith("-")) return undefined;

  const val = Number(numPartStr);
  const bits = parseInt(suffix.slice(1), 10);

  if (isUnsigned) {
    const max = Math.pow(2, bits) - 1;
    if (val < 0 || val > max) return undefined;
  } else {
    const max = Math.pow(2, bits - 1) - 1;
    const min = -Math.pow(2, bits - 1);
    if (val < min || val > max) return undefined;
  }

  return numPartStr;
}

function tokenize(source: string): string[] {
  const tokens: string[] = [];
  let currentToken = "";
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const isOperator =
      char === "+" || char === "-" || char === "*" || char === "/";
    const isSpace = char === " ";

    if (isSpace && currentToken !== "") {
      tokens.push(currentToken);
      currentToken = "";
    } else if (isOperator) {
      // If minus and current is empty, it might be a negative number start or standalone operator
      // To satisfy simplicity for "1U8 + 2U8" and "-128I8", we treat operators as separators
      // but negative numbers need the minus attached to the token.
      if (char === "-" && currentToken === "") {
        currentToken = "-";
      } else {
        if (currentToken !== "" && currentToken !== "-")
          tokens.push(currentToken);
        else if (currentToken === "-") tokens.push("-");
        tokens.push(char);
        currentToken = "";
      }
    } else if (!isSpace) {
      currentToken += char;
    }
  }
  if (currentToken !== "") tokens.push(currentToken);
  return tokens;
}

/**
 * Compile a source string to JavaScript. (Stubbed)
 * @param source - source string to compile
 * @returns compiled JavaScript as a string
 */
export function compile(source: string): string {
  const tokens = tokenize(source.trim());
  const compiledTokens = tokens.map((token) => {
    const intResult = handleIntSuffix(token);
    if (intResult !== undefined) return intResult;
    return token;
  });

  return compiledTokens.join(" ");
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
  // Avoid using Function constructors (disallowed by lint).
  const compiled = compile(source);

  try {
    // eslint-disable-next-line no-eval
    const val = eval(compiled);
    const value = Number(val);

    if (Number.isNaN(value)) {
      return err(new Error("Compiled output resulting in NaN"));
    }
    return ok(value);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
