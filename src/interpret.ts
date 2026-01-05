import { Result, ok, err } from "./result";

export function interpret(
  input: string,
  env: Record<string, number> = {}
): Result<number, string> {
  const trimmed = input.trim();

  // let binding: let name [: Type] = init; expr
  if (trimmed.startsWith("let ")) {
    return evalLetBinding(trimmed, env);
  }

  // Conditional expression: if (cond) thenExpr else elseExpr
  if (trimmed.startsWith("if")) {
    const parsed = parseIfElse(trimmed);
    if (parsed) {
      // IF DEBUG logs disabled
      const condRes = interpret(parsed.cond, env);
      if (!condRes.ok) return err(condRes.error);
      const condTruthy = condRes.value !== 0;
      let branch: string;
      if (condTruthy) {
        branch = parsed.thenExpr;
      } else {
        branch = parsed.elseExpr;
      }
      return interpret(branch, env);
    }
  }

  // Preprocess parenthesized inline if-expressions (e.g., (if ...))
  let processed = trimmed;
  const replaced = replaceParenthesizedIfs(processed, env);
  if (!replaced.ok) return err(replaced.error);
  processed = replaced.value;

  // Boolean literal support
  if (processed === "true") return ok(1);
  if (processed === "false") return ok(0);

  // Direct numeric string
  const n = Number(processed);
  if (Number.isFinite(n)) {
    return ok(n);
  }

  // Allow expressions consisting of digits, operators, dots, parentheses, whitespace, logical operators, booleans and variables
  if (/^[0-9+\-*/().\s|&a-z_]+$/i.test(processed)) {
    const r = evaluateExpression(processed, env);
    if (r.ok) return ok(r.value);
    return err(r.error);
  }

  return err("interpret: input is not a number or valid expression");
}

// --- Expression evaluator (supports +, -, *, /, parentheses, decimals, unary minus)

type Token =
  | { type: "num"; value: number }
  | { type: "op"; value: string }
  | { type: "paren"; value: string };

function tokenToString(t: Token): string {
  if (t.type === "num") return String(t.value);
  return t.value;
}

function tokenFromString(
  s: string,
  env: Record<string, number> = {}
): Result<Token, string> {
  const lower = s.toLowerCase();
  if (lower === "true" || lower === "false") {
    if (lower === "true") return ok({ type: "num", value: 1 });
    return ok({ type: "num", value: 0 });
  }
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) {
    if (env && Object.prototype.hasOwnProperty.call(env, s)) {
      return ok({ type: "num", value: env[s] });
    }
    return err(`Unknown variable: ${s}`);
  }
  if (s === "(" || s === ")") return ok({ type: "paren", value: s });
  const operators = new Set(["+", "-", "*", "/", "||", "&&"]);
  if (operators.has(s)) return ok({ type: "op", value: s });
  const num = Number(s);
  if (!Number.isFinite(num)) return err("Invalid number in expression");
  return ok({ type: "num", value: num });
}

function tokenize(
  expr: string,
  env: Record<string, number> = {}
): Result<Token[], string> {
  // Regex-based tokenizer using matchAll to simplify control flow
  const tokens: Token[] = [];
  const tokenRe =
    /(?:\d+\.\d*|\d*\.\d+|\d+|true|false|\|\||&&|[A-Za-z_][A-Za-z0-9_]*)|[()+\-*/]/gi;

  for (const m of expr.matchAll(tokenRe)) {
    const tk = tokenFromString(m[0], env);
    if (!tk.ok) return err(tk.error);
    tokens.push(tk.value);
  }

  // Sanity check: ensure entire input consists of valid tokens
  const cleaned = expr.replace(/\s+/g, "");
  let normalized = cleaned.replace(/true/gi, "1").replace(/false/gi, "0");
  // Replace variable names with their numeric values for comparison
  for (const k of Object.keys(env)) {
    const v = String(env[k]);
    normalized = normalized.replace(new RegExp("\\b" + k + "\\b", "g"), v);
  }
  const reconstructed = tokens.map((t) => tokenToString(t)).join("");
  if (normalized !== reconstructed) {
    return err("Invalid character in expression");
  }
  return ok(tokens);
}

function markUnaryMinus(
  tokens: Token[]
): (Token | { type: "op"; value: "u-" })[] {
  const out: (Token | { type: "op"; value: "u-" })[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    let pushed = false;
    if (t.type === "op" && t.value === "-") {
      const prev = tokens[i - 1];
      const isUnary =
        !prev ||
        prev.type === "op" ||
        (prev.type === "paren" && prev.value === "(");
      if (isUnary) {
        out.push({ type: "op", value: "u-" });
        pushed = true;
      }
    }
    if (!pushed) out.push(t);
  }
  return out;
}

function popOp(
  ops: ({ type: "op"; value: string } | { type: "paren"; value: string })[]
): { type: "op"; value: string } | undefined {
  const p = ops.pop();
  if (!p || p.type !== "op") return undefined;
  return p;
}

function peekOpValue(
  ops: ({ type: "op"; value: string } | { type: "paren"; value: string })[]
): string | undefined {
  const last = ops[ops.length - 1];
  if (!last || last.type !== "op") return undefined;
  return last.value;
}

function popWhileHigherPrecedence(
  currentOpValue: string,
  ops: ({ type: "op"; value: string } | { type: "paren"; value: string })[],
  output: (Token | { type: "op"; value: "u-" })[],
  precedence: (op: string) => number,
  isLeftAssoc: (op: string) => boolean
) {
  let running = true;
  while (running) {
    const topOp = peekOpValue(ops);
    if (!topOp) {
      running = false;
    } else {
      const p1 = precedence(currentOpValue);
      const p2 = precedence(topOp);
      if (
        (isLeftAssoc(currentOpValue) && p1 <= p2) ||
        (!isLeftAssoc(currentOpValue) && p1 < p2)
      ) {
        const popped = popOp(ops);
        if (!popped) {
          running = false;
        } else {
          output.push(popped);
        }
      } else {
        running = false;
      }
    }
  }
}

function popUntilLeftParen(
  ops: ({ type: "op"; value: string } | { type: "paren"; value: string })[],
  output: (Token | { type: "op"; value: "u-" })[]
): Result<void, string> {
  let found = false;
  let error: string | undefined;
  while (ops.length > 0 && !found && !error) {
    const top = ops.pop()!;
    if (top.type === "paren" && top.value === "(") {
      found = true;
    } else if (top.type === "op") {
      output.push(top);
    } else {
      error = "Mismatched parentheses in expression";
    }
  }
  if (error) return err(error);
  if (!found) return err("Mismatched parentheses in expression");
  return ok(undefined);
}

function toRPN(
  tokens: Token[]
): Result<(Token | { type: "op"; value: "u-" })[], string> {
  const tks = markUnaryMinus(tokens);
  const output: (Token | { type: "op"; value: "u-" })[] = [];
  const ops: (
    | { type: "op"; value: string }
    | { type: "paren"; value: string }
  )[] = [];

  function precedence(op: string): number {
    if (op === "||") return 0;
    if (op === "&&") return 1;
    if (op === "+" || op === "-") return 2;
    if (op === "*" || op === "/") return 3;
    if (op === "u-") return 4;
    return 0;
  }
  const isLeftAssoc = (op: string) => op !== "u-";

  for (const t of tks) {
    if (t.type === "num") {
      output.push(t);
    } else if (t.type === "op") {
      popWhileHigherPrecedence(t.value, ops, output, precedence, isLeftAssoc);
      ops.push(t);
    } else if (t.type === "paren") {
      if (t.value === "(") {
        ops.push(t);
      } else {
        const res = popUntilLeftParen(ops, output);
        if (!res.ok) return err(res.error);
      }
    }
  }

  while (ops.length > 0) {
    const top = ops.pop()!;
    if (top.type === "paren")
      return err("Mismatched parentheses in expression");
    if (top.type === "op") {
      output.push(top);
    } else {
      return err("Mismatched parentheses in expression");
    }
  }
  return ok(output);
}

function evalRPN(
  rpn: (Token | { type: "op"; value: "u-" })[]
): Result<number, string> {
  const stack: number[] = [];
  for (const t of rpn) {
    if (t.type === "num") {
      stack.push(t.value);
    } else {
      // t.type === 'op'
      const op = t.value;
      if (op === "u-") {
        const a = stack.pop();
        if (a === undefined) return err("Invalid expression");
        stack.push(-a);
      } else {
        // binary
        const b = stack.pop();
        const a = stack.pop();
        if (a === undefined || b === undefined)
          return err("Invalid expression");
        const opRes = applyBinaryOp(op, a, b);
        if (!opRes.ok) return err(opRes.error);
        stack.push(opRes.value);
      }
    }
  }
  if (stack.length !== 1) return err("Invalid expression");
  return ok(stack[0]);
}

function applyBinaryOp(
  op: string,
  a: number,
  b: number
): Result<number, string> {
  if (op === "+") {
    return ok(a + b);
  }
  if (op === "-") {
    return ok(a - b);
  }
  if (op === "*") {
    return ok(a * b);
  }
  if (op === "/") {
    if (b === 0) return err("Division by zero");
    return ok(a / b);
  }
  if (op === "&&") {
    if (a !== 0 && b !== 0) {
      return ok(1);
    }
    return ok(0);
  }
  if (op === "||") {
    if (a !== 0 || b !== 0) {
      return ok(1);
    }
    return ok(0);
  }
  return err("Unknown operator");
}

function evaluateExpression(
  expr: string,
  env: Record<string, number> = {}
): Result<number, string> {
  const tokensRes = tokenize(expr, env);
  if (!tokensRes.ok) return err(tokensRes.error);
  const rpnRes = toRPN(tokensRes.value);
  if (!rpnRes.ok) return err(rpnRes.error);
  const evalRes = evalRPN(rpnRes.value);
  return evalRes;
}

function scanWithDepth(
  input: string,
  startIdx: number,
  match: (input: string, i: number, depth: number) => boolean
): number {
  let depth = 0;
  for (let i = startIdx; i < input.length; i++) {
    const ch = input[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (match(input, i, depth)) return i;
  }
  return -1;
}

function findMatchingParen(input: string, startIdx: number): number {
  return scanWithDepth(
    input,
    startIdx,
    (_input, i, depth) => _input[i] === ")" && depth === 0
  );
}

function findElseAtDepthZero(input: string, startIdx: number): number {
  return scanWithDepth(
    input,
    startIdx,
    (input, i, depth) => depth === 0 && input.startsWith("else", i)
  );
}

function findSemicolonAtDepthZero(input: string, startIdx: number): number {
  return scanWithDepth(
    input,
    startIdx,
    (input, i, depth) => depth === 0 && input[i] === ";"
  );
}

function parseIfElse(
  input: string
): { cond: string; thenExpr: string; elseExpr: string } | undefined {
  // Expecting: if (cond) thenExpr else elseExpr
  if (!input.startsWith("if")) return undefined;
  let i = 2; // after 'if'
  while (i < input.length && /\s/.test(input[i])) i++;
  if (input[i] !== "(") return undefined;
  const j = findMatchingParen(input, i);
  if (j === -1) return undefined;
  const cond = input.slice(i + 1, j).trim();
  let pos = j + 1;
  while (pos < input.length && /\s/.test(input[pos])) pos++;

  const elseIdx = findElseAtDepthZero(input, pos);
  if (elseIdx === -1) return undefined;

  const thenExpr = input.slice(pos, elseIdx).trim();
  const elseExpr = input.slice(elseIdx + 4).trim();
  if (thenExpr.length === 0 || elseExpr.length === 0) return undefined;
  return { cond, thenExpr, elseExpr };
}
function evalLetBinding(
  input: string,
  env: Record<string, number> = {}
): Result<number, string> {
  // input starts with 'let '
  const rest = input.slice(4).trim();
  const eqIdx = rest.indexOf("=");
  if (eqIdx === -1) return err("Invalid let binding");
  const beforeEq = rest.slice(0, eqIdx).trim();
  const afterEq = rest.slice(eqIdx + 1);
  const m = beforeEq.match(
    /^([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*([A-Za-z_][A-Za-z0-9_]*))?$/
  );
  if (!m) return err("Invalid let binding");
  const name = m[1];
  const type = m[2];
  const semIdx = findSemicolonAtDepthZero(afterEq, 0);
  if (semIdx === -1) return err("Invalid let binding; missing ';'");
  const initExpr = afterEq.slice(0, semIdx).trim();
  const body = afterEq.slice(semIdx + 1).trim();
  const initRes = interpret(initExpr, env);
  if (!initRes.ok) return err(initRes.error);
  let value = initRes.value;
  if (type && type.toLowerCase() === "bool") {
    if (value !== 0) {
      value = 1;
    } else {
      value = 0;
    }
  }
  const newEnv = { ...env, [name]: value };
  return interpret(body, newEnv);
}
function replaceParenthesizedIfs(
  input: string,
  env: Record<string, number> = {}
): Result<string, string> {
  let out = input;
  let idx = out.indexOf("(if");
  while (idx !== -1) {
    const matchIdx = findMatchingParen(out, idx);
    if (matchIdx === -1) return err("Unmatched parentheses in inline if");
    const inner = out.slice(idx + 1, matchIdx).trim(); // starts with 'if'
    const parsed = parseIfElse(inner);
    if (!parsed) return err("Invalid inline if");
    const condRes = interpret(parsed.cond, env);
    if (!condRes.ok) return err(condRes.error);
    const condTruthy = condRes.value !== 0;
    let branchExpr: string;
    if (condTruthy) {
      branchExpr = parsed.thenExpr;
    } else {
      branchExpr = parsed.elseExpr;
    }
    const branchRes = interpret(branchExpr, env);
    if (!branchRes.ok) return err(branchRes.error);
    out = out.slice(0, idx) + String(branchRes.value) + out.slice(matchIdx + 1);
    idx = out.indexOf("(if");
  }
  return ok(out);
}
