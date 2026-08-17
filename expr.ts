import type { Result } from "./index";

const NUMBER_RE = /^[+-]?(\d+(\.\d+)?)/;

/**
 * Parses and evaluates an arithmetic expression of numbers with +, -, and *.
 * Left-associative; * binds tighter than + and -. Supports ( ) and { } groups.
 */
export function parseExpression(source: string): Result<number, Error> {
  let pos = 0;

  const skipSpaces = (): void => {
    while (pos < source.length && source[pos] === " ") {
      pos += 1;
    }
  };

  const parseNumber = (): Result<number, Error> => {
    const match = NUMBER_RE.exec(source.slice(pos));
    if (!match) {
      return {
        ok: false,
        error: new Error(
          `parseExpression: expected a number at position ${pos} in "${source}". ` +
            `Fix: put a number (e.g. "1" or "2.5") where the operator or expression begins.`,
        ),
      };
    }
    pos += match[0].length;
    return { ok: true, value: Number(match[0]) };
  };

  const parseAdditive = (): Result<number, Error> => {
    const first = parseTerm();
    if (!first.ok) {
      return first;
    }
    let value = first.value;
    for (;;) {
      skipSpaces();
      if (pos >= source.length || source[pos] === ")" || source[pos] === "}") {
        return { ok: true, value };
      }
      const op = source[pos];
      if (op !== "+" && op !== "-") {
        return {
          ok: false,
          error: new Error(
            `parseExpression: unexpected character "${op}" at position ${pos} in "${source}". ` +
              `Fix: use only numbers, "+", "-", "*", and ( ) or { } groups (e.g. "(2 + 3) * 4").`,
          ),
        };
      }
      pos += 1;
      skipSpaces();
      const next = parseTerm();
      if (!next.ok) {
        return next;
      }
      value = op === "+" ? value + next.value : value - next.value;
    }
  };

  const parseFactor = (): Result<number, Error> => {
    skipSpaces();
    const open = source[pos];
    if (open === "(" || open === "{") {
      const close = open === "(" ? ")" : "}";
      pos += 1;
      const inner = parseAdditive();
      if (!inner.ok) {
        return inner;
      }
      skipSpaces();
      if (pos >= source.length || source[pos] !== close) {
        return {
          ok: false,
          error: new Error(
            `parseExpression: expected "${close}" at position ${pos} in "${source}". ` +
              `Fix: close the group with its matching delimiter (e.g. "(2 + 3)" or "{ 2 + 3 }").`,
          ),
        };
      }
      pos += 1;
      return { ok: true, value: inner.value };
    }
    return parseNumber();
  };

  const parseTerm = (): Result<number, Error> => {
    const first = parseFactor();
    if (!first.ok) {
      return first;
    }
    let value = first.value;
    for (;;) {
      skipSpaces();
      if (pos >= source.length || source[pos] !== "*") {
        return { ok: true, value };
      }
      pos += 1;
      skipSpaces();
      const next = parseFactor();
      if (!next.ok) {
        return next;
      }
      value = value * next.value;
    }
  };

  skipSpaces();
  return parseAdditive();
}
