export type EvalError = {
  kind: "invalid_input";
  input: string;
  reason: "not a finite number";
  hint: 'pass a numeric string, e.g. "42"';
};

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function evaluate(input: string): Result<number, EvalError> {
  if (input === "") return { ok: true, value: 0 };
  const parts = input.split("+");
  const [leftStr, rightStr] = parts;
  if (parts.length === 2 && leftStr !== undefined && rightStr !== undefined) {
    const left = Number(leftStr.trim());
    const right = Number(rightStr.trim());
    if (Number.isFinite(left) && Number.isFinite(right))
      return { ok: true, value: left + right };
  }
  const n = Number(input);
  if (Number.isFinite(n)) return { ok: true, value: n };
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
