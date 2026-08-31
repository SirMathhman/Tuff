export type EvalResult =
  | { ok: true; value: number }
  | { ok: false; error: { kind: string; message: string; position: number } };

export function evaluate(input: string): EvalResult {
  if (input.trim() === "") {
    return { ok: true, value: 0 };
  }
  const match = /^\s*(\d+)\s*$/.exec(input);
  if (!match) {
    return {
      ok: false,
      error: { kind: "syntax", message: "expected a number", position: 0 },
    };
  }
  return { ok: true, value: Number(match[1]) };
}
