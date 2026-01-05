import { Result, ok, err } from "./result";

export function evaluateArithmetic(expr: string): Result<number, string> {
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

export function reduceParentheses(expr: string): Result<string, string> {
  let s = expr;
  // Evaluate innermost parentheses repeatedly
  while (s.includes("(")) {
    const openIdx = s.lastIndexOf("(");
    const closeIdx = s.indexOf(")", openIdx);
    if (closeIdx === -1) return err("Mismatched parentheses");
    const inner = s.slice(openIdx + 1, closeIdx).trim();
    if (inner.length === 0) return err("Empty parentheses");
    // Evaluate inner expression using existing arithmetic evaluator
    const evalRes = evaluateArithmetic(inner);
    if (!evalRes.ok) return err(evalRes.error);
    s = s.slice(0, openIdx) + String(evalRes.value) + s.slice(closeIdx + 1);
  }
  return ok(s);
}
