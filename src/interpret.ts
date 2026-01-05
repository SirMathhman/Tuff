import { Result, ok, err } from "./result";

export function interpret(input: string): Result<number, string> {
  let trimmed = input.trim();

  // Let-binding: let name [: Type] = init; body
  if (trimmed.startsWith("let ")) {
    return evalLetBinding(trimmed);
  }

  // Block expression: { ... }
  if (trimmed.startsWith("{")) {
    const closeIdx = findMatchingBrace(trimmed, 0);
    if (closeIdx === -1) return err("Mismatched braces");
    const inner = trimmed.slice(1, closeIdx).trim();
    if (inner.length === 0) return err("Empty block");
    const evalRes = interpret(inner);
    if (!evalRes.ok) return err(evalRes.error);
    // If there's trailing code after the block, evaluate it next (block-local bindings shouldn't leak)
    const rest = trimmed.slice(closeIdx + 1).trim();
    if (rest.length === 0) return evalRes;
    return interpret(rest);
  }

  const dupStructs = checkDuplicateStructs(trimmed);
  if (!dupStructs.ok) return err(dupStructs.error);

  // Empty struct declaration: `struct Name {}` evaluates to 0 for now
  if (/^\s*struct\s+[A-Za-z_][A-Za-z0-9_]*\s*\{\s*\}\s*$/i.test(trimmed)) {
    return ok(0);
  }

  // Reduce parentheses first (evaluate innermost parentheses recursively)
  if (trimmed.includes("(")) {
    const reduced = reduceParentheses(trimmed);
    if (!reduced.ok) return err(reduced.error);
    trimmed = reduced.value;
  }

  // Boolean literal support
  if (trimmed.toLowerCase() === "true") return ok(1);
  if (trimmed.toLowerCase() === "false") return ok(0);

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

function evalLetBinding(input: string): Result<number, string> {
  // input starts with 'let '
  const rest = input.slice(4).trim();
  const eqIdx = rest.indexOf("=");
  if (eqIdx === -1) return err("Invalid let binding");
  const beforeEq = rest.slice(0, eqIdx).trim();
  const afterEq = rest.slice(eqIdx + 1);

  // Find semicolon at depth zero to separate init and body
  const semIdx = findSemicolonAtDepthZero(afterEq, 0);
  if (semIdx === -1) return err("Invalid let binding; missing ';'");

  const initExpr = afterEq.slice(0, semIdx).trim();
  const body = afterEq.slice(semIdx + 1).trim();

  const m = beforeEq.match(
    /^([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*([A-Za-z_][A-Za-z0-9_]*))?$/
  );
  if (!m) return err("Invalid let binding");
  const name = m[1];
  const type = m[2];

  const initRes = interpret(initExpr);
  if (!initRes.ok) return err(initRes.error);
  let value = initRes.value;
  if (type && type.toLowerCase() === "bool") {
    if (value !== 0) value = 1;
    else value = 0;
  }

  // Detect duplicate binding anywhere in body (shadowing disallowed)
  const dupRe = new RegExp("\\blet\\s+" + name + "\\b");
  if (dupRe.test(body)) return err("Duplicate binding");

  // Substitute the variable name in body with its numeric value (word boundary)
  const replaced = body.replace(
    new RegExp("\\b" + name + "\\b", "g"),
    String(value)
  );
  return interpret(replaced);
}

function findSemicolonAtDepthZero(input: string, startIdx: number): number {
  let depth = 0;
  for (let i = startIdx; i < input.length; i++) {
    const ch = input[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth === 0 && ch === ";") return i;
  }
  return -1;
}

function findMatchingBrace(input: string, startIdx: number): number {
  let depth = 0;
  for (let i = startIdx; i < input.length; i++) {
    const ch = input[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (depth === 0) return i;
  }
  return -1;
}

function checkDuplicateStructs(input: string): Result<void, string> {
  const structRe = /struct\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{\s*\}/gi;
  const names: string[] = [];
  for (const m of input.matchAll(structRe)) {
    names.push(m[1]);
  }
  const counts: Record<string, number> = {};
  for (const n of names) {
    counts[n] = (counts[n] || 0) + 1;
    if (counts[n] > 1) return err("Duplicate binding");
  }
  return ok(undefined);
}

function reduceParentheses(expr: string): Result<string, string> {
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

/* Complex evaluator removed to keep implementation minimal for the requested test case (simple a + b). */
