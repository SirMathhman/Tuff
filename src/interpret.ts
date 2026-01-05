import { Result, ok, err } from "./result";

export function interpret(input: string): Result<number, string> {
  const trimmed = input.trim();

  // Direct numeric literal
  const n = Number(trimmed);
  if (Number.isFinite(n)) {
    return ok(n);
  }

  // Simple arithmetic chains with +, -, *, / (no parentheses).
  // Evaluate * and / first (left-to-right), then + and - left-to-right.
  const arithChainRe =
    /^\s*[+\-]?\d+(?:\.\d+)?(?:\s*[+\-*/]\s*[+\-]?\d+(?:\.\d+)?)*\s*$/;
  if (arithChainRe.test(trimmed)) {
    return evaluateArithmetic(trimmed);
  }

  return err("Err");
}

function evaluateArithmetic(expr: string): Result<number, string> {
  const tokenRe = /[+\-]?\d+(?:\.\d+)?|[+\-*/]/g;
  const tokens = expr.match(tokenRe) || [];
  const nums: number[] = [];
  const ops: string[] = [];
  for (const t of tokens) {
    if (/^[+\-]?\d/.test(t)) nums.push(Number(t));
    else ops.push(t);
  }
  if (nums.length === 0) return err("Invalid expression");

  // First pass: handle * and /
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op === "*" || op === "/") {
      const a = nums[i];
      const b = nums[i + 1];
      if (!Number.isFinite(b)) return err("Invalid number in expression");
      let res: number;
      if (op === "*") res = a * b;
      else {
        if (b === 0) return err("Division by zero");
        res = a / b;
      }
      nums[i] = res;
      nums.splice(i + 1, 1);
      ops.splice(i, 1);
      i--; // re-check at current index
    }
  }

  // Second pass: handle + and - left-to-right
  let acc = nums[0];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const n = nums[i + 1];
    if (!Number.isFinite(n)) return err("Invalid number in expression");
    if (op === "+") acc += n;
    else acc -= n;
  }
  return ok(acc);
}

/* Complex evaluator removed to keep implementation minimal for the requested test case (simple a + b). */
