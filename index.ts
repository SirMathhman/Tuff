export type EvalError = {
  kind: "invalid_input";
  input: string;
  reason: "not a finite number";
  hint: 'pass a numeric string, e.g. "42"';
};

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function evaluate(input: string): Result<number, EvalError> {
  const parts = input.split("+");
  const values = parts.map((p) => Number(p.trim()));
  if (values.every((v) => Number.isFinite(v)))
    return { ok: true, value: values.reduce((a, b) => a + b, 0) };
  return {
    ok: false,
    error: {
      kind: "invalid_input",
      input,
      reason: "not a finite number",
      hint: 'pass a numeric string, e.g. "42"',
    },
  };
}
