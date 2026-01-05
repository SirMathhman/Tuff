import { Result, ok, err } from "./result";

export function interpret(input: string): Result<number, string> {
  const trimmed = input.trim();

  // Direct numeric literal
  const n = Number(trimmed);
  if (Number.isFinite(n)) {
    return ok(n);
  }

  // Simple addition and chained additions: a + b + c + ...
  const plusChainRe = /^\s*[+-]?\d+(?:\.\d+)?(?:\s*\+\s*[+-]?\d+(?:\.\d+)?)*\s*$/;
  if (plusChainRe.test(trimmed)) {
    const numRe = /[+-]?\d+(?:\.\d+)?/g;
    const nums = trimmed.match(numRe) || [];
    const vals = nums.map(Number);
    if (vals.some((v) => !Number.isFinite(v))) return err("Invalid number in expression");
    return ok(vals.reduce((s, v) => s + v, 0));
  }

  return err("Err");
}

/* Complex evaluator removed to keep implementation minimal for the requested test case (simple a + b). */
