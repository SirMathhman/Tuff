export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export type EvalError =
  | { kind: "invalid-token"; index: number; token: string }
  | { kind: "unexpected-end"; index: number };

const NUMBER_RE = /^\d+(\.\d+)?$/;

export function evaluate(input: string): Result<number, EvalError> {
  if (input === "") return { ok: true, value: 0 };

  const tokens = input.split(/([+-])/);
  let i = 0;
  if (tokens[0] === "" && tokens[1] === "-") {
    i = 2;
  }
  if ((tokens.length - i) % 2 === 0) {
    return {
      ok: false,
      error: { kind: "unexpected-end", index: input.trimEnd().length },
    };
  }

  let sum = 0;
  let offset = 0;
  for (; i < tokens.length; i += 2) {
    const raw = tokens[i] ?? "";
    const token = raw.trim();
    if (token === "") {
      return { ok: false, error: { kind: "unexpected-end", index: offset } };
    }
    if (!NUMBER_RE.test(token)) {
      return {
        ok: false,
        error: { kind: "invalid-token", index: offset, token },
      };
    }
    const op = i === 0 ? "+" : tokens[i - 1];
    sum += op === "+" ? Number(token) : -Number(token);
    offset += raw.length + (i + 1 < tokens.length ? 1 : 0);
  }

  return { ok: true, value: sum };
}
