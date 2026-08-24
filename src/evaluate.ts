import type { Result } from "./errors.ts";

export function evaluate(input: string): Result<unknown> {
  if (input === "") return { ok: true, value: 0 };
  const js = input.replace(/\blet\s+mut(?=\s)/g, "let");
  try {
    // eslint-disable-next-line no-new-func -- evaluating arbitrary code is the purpose of this function
    return { ok: true, value: new Function(js)() };
  } catch (cause) {
    return { ok: false, error: { kind: "EvaluationFailed", cause } };
  }
}
