export type EvalResult =
  | { ok: true; value: number }
  | { ok: false; error: { kind: string; message: string; position: number } };

export function evaluate(input: string): EvalResult {
  // TODO: implement
  return { ok: true, value: 0 };
}
