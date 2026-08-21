export type EvalError = {
  kind: "invalid_input";
  input: string;
  reason: "not a finite number";
  hint: 'pass a numeric string, e.g. "42"';
};

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function evaluate(input: string): Result<number, EvalError> {
  const fail = (): Result<number, EvalError> => ({
    ok: false,
    error: {
      kind: "invalid_input",
      input,
      reason: "not a finite number",
      hint: 'pass a numeric string, e.g. "42"',
    },
  });
  const terms = input.split(/([+-])/);
  let value = 0;
  let op = "+";
  for (const term of terms) {
    if (term === "+" || term === "-") {
      op = term;
      continue;
    }
    let product = 1;
    for (const factor of term.split("*")) {
      const n = Number(factor.trim());
      if (!Number.isFinite(n)) return fail();
      product *= n;
    }
    value = op === "-" ? value - product : value + product;
    op = "+";
  }
  return { ok: true, value };
}
