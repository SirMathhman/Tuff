import type { TuffError } from "./errors.js";
import type { Result } from "./result.js";

type Token =
  | { kind: "number"; value: number }
  | { kind: "plus" }
  | { kind: "minus" };

function fail<T>(input: string, message: string): Result<T, TuffError> {
  return {
    ok: false,
    error: {
      kind: "unsupported_expression",
      input,
      message,
    },
  };
}

function tokenize(input: string): Result<Token[], TuffError> {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (ch === "+") {
      tokens.push({ kind: "plus" });
      i += 1;
      continue;
    }

    // A `-` is a binary operator only when it follows a token;
    // otherwise it starts a negative numeric literal.
    if (ch === "-" && tokens.length > 0) {
      tokens.push({ kind: "minus" });
      i += 1;
      continue;
    }

    const match = /^-?\d+(\.\d+)?/.exec(input.slice(i));
    if (match) {
      tokens.push({ kind: "number", value: Number(match[0]) });
      i += match[0].length;
      continue;
    }

    return fail(input, `Unexpected character ${JSON.stringify(ch)} at position ${i}`);
  }

  return { ok: true, value: tokens };
}

function parse(tokens: Token[], input: string): Result<number, TuffError> {
  let index = 0;

  function parseNumber(): Result<number, TuffError> {
    const token = tokens[index];

    if (token?.kind !== "number") {
      return fail(input, "Expected a number");
    }

    index += 1;
    return { ok: true, value: token.value };
  }

  function parseExpression(): Result<number, TuffError> {
    const left = parseNumber();
    if (!left.ok) {
      return left;
    }

    let total = left.value;

    while (tokens[index]?.kind === "plus" || tokens[index]?.kind === "minus") {
      const op = tokens[index].kind;
      index += 1;
      const right = parseNumber();
      if (!right.ok) {
        return right;
      }
      total = op === "plus" ? total + right.value : total - right.value;
    }

    return { ok: true, value: total };
  }

  const result = parseExpression();
  if (!result.ok) {
    return result;
  }

  if (index < tokens.length) {
    return fail(input, "Unexpected trailing tokens");
  }

  return result;
}

/**
 * Evaluates a Tuff expression.
 *
 * @param input - The expression to evaluate.
 * @returns A Result holding the numeric value, or a structured error.
 *          An empty (or whitespace-only) expression evaluates to 0.
 *          Numeric literals and binary `+`/`-` expressions are supported.
 */
export function evaluate(input: string): Result<number, TuffError> {
  const trimmed = input.trim();

  if (trimmed === "") {
    return { ok: true, value: 0 };
  }

  const tokens = tokenize(trimmed);
  if (!tokens.ok) {
    return tokens;
  }

  return parse(tokens.value, input);
}
