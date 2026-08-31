export type EvalResult =
  | { ok: true; value: number }
  | { ok: false; error: { kind: string; message: string; position: number } };

export function evaluate(input: string): EvalResult {
  if (input.length === 0) {
    return {
      ok: false,
      error: { kind: "empty", message: "empty input", position: 0 },
    };
  }
  // TODO: implement
  return { ok: true, value: 0 };
}
