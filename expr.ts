import type { Result } from "./index";

const NUMBER_RE = /^[+-]?(\d+(\.\d+)?)/;

/**
 * Parses and evaluates an arithmetic expression of numbers with + and -.
 * Left-associative, no parentheses.
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

  skipSpaces();
  const first = parseNumber();
  if (!first.ok) {
    return first;
  }

  let value = first.value;
  for (;;) {
    skipSpaces();
    if (pos >= source.length) {
      return { ok: true, value };
    }
    const op = source[pos];
    if (op !== "+" && op !== "-") {
      return {
        ok: false,
        error: new Error(
          `parseExpression: unexpected character "${op}" at position ${pos} in "${source}". ` +
            `Fix: use only numbers, "+", and "-" (e.g. "1 + 2").`,
        ),
      };
    }
    pos += 1;
    skipSpaces();
    const next = parseNumber();
    if (!next.ok) {
      return next;
    }
    value = op === "+" ? value + next.value : value - next.value;
  }
}
