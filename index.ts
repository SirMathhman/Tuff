export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export type EvalError =
  | { kind: "invalid-token"; index: number; token: string }
  | { kind: "unexpected-end"; index: number };

const NUMBER_RE = /^-?\d+(\.\d+)?$/;

export function evaluate(input: string): Result<number, EvalError> {
  if (input === "") return { ok: true, value: 0 };

  const parts = input.split("+");
  let sum = 0;
  let offset = 0;

  for (const raw of parts) {
    const token = raw.trim();
    if (token === "") {
      return { ok: false, error: { kind: "unexpected-end", index: offset } };
    }
    if (!NUMBER_RE.test(token)) {
      return { ok: false, error: { kind: "invalid-token", index: offset, token } };
    }
    sum += Number(token);
    offset += raw.length + 1;
  }

  return { ok: true, value: sum };
}
