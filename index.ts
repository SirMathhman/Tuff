export type EvalError = {
  kind: "invalid_input";
  input: string;
  reason: "not a finite number";
  hint: 'pass a numeric string, e.g. "42"';
};

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function evaluate(input: string): Result<number, EvalError> {
  const tokens = input.split(/([+-])/);
  let value = 0;
  let op = "+";
  for (const token of tokens) {
    if (token === "+" || token === "-") {
      op = token;
      continue;
    }
    const n = Number(token.trim());
    if (!Number.isFinite(n))
      return {
        ok: false,
        error: {
          kind: "invalid_input",
          input,
          reason: "not a finite number",
          hint: 'pass a numeric string, e.g. "42"',
        },
      };
    value = op === "-" ? value - n : value + n;
    op = "+";
  }
  return { ok: true, value };
}
