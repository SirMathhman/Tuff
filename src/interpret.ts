import { Result, ok, err } from "./result";

export function interpret(input: string): Result<number, string> {
  const trimmed = input.trim();

  // Direct numeric literal
  const n = Number(trimmed);
  if (Number.isFinite(n)) {
    return ok(n);
  }

  // Simple chain of additions and subtractions: a (+|-) b (+|-) c ... evaluated left-to-right
  const addSubChainRe = /^\s*[+-]?\d+(?:\.\d+)?(?:\s*[+\-]\s*\d+(?:\.\d+)?)*\s*$/;
  if (addSubChainRe.test(trimmed)) {
    const nums = trimmed.match(/\d+(?:\.\d+)?/g) || [];
    const ops = trimmed.match(/[+\-]/g) || [];
    if (nums.length === 0) return err("Invalid expression");

    // Handle leading sign
    let acc = Number(nums[0]);
    const firstTrim = trimmed.trim();
    if (firstTrim[0] === "-") acc = -acc;

    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      const next = Number(nums[i + 1]);
      if (!Number.isFinite(next)) return err("Invalid number in expression");
      if (op === "+") acc = acc + next;
      else acc = acc - next;
    }
    return ok(acc);
  }

  return err("Err");
}

/* Complex evaluator removed to keep implementation minimal for the requested test case (simple a + b). */
