export function interpret(input: string): string {
  const trimmed = input.trim();

  // quick number-only shortcut
  if (/^\d+$/.test(trimmed)) return trimmed;

  // Statements are semicolon separated at top-level (respecting nested braces/parentheses)
  function splitTopLevelStatements(s: string): string[] {
    const res: string[] = [];
    let buf = "";
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === ";" && depth === 0) {
        if (buf.trim()) res.push(buf.trim());
        buf = "";
        continue;
      }
      if (ch === "(" || ch === "{") depth++;
      else if (ch === ")" || ch === "}") depth = Math.max(0, depth - 1);
      buf += ch;
    }
    if (buf.trim()) res.push(buf.trim());
    return res;
  }

  const isBlock = trimmed.startsWith("{") && trimmed.endsWith("}");
  const stmtsSource = isBlock ? trimmed.slice(1, -1) : trimmed;
  const stmts = splitTopLevelStatements(stmtsSource);
  const env = new Map<string, number>();
  let lastResult: number | undefined = undefined;

  for (const stmt of stmts) {
    // let statement: let x : I32 = <expr>
    const letMatch = stmt.match(
      /^let\s+([A-Za-z_]\w*)\s*(?::\s*([A-Za-z0-9_]+))?\s*=\s*(.*)$/s
    );
    if (letMatch) {
      const name = letMatch[1];
      const type = letMatch[2];
      const expr = letMatch[3].trim();
      // validate characters (allow braces, digits, identifiers, operators)
      if (!/^[\d\s+\-*/().{}A-Za-z_\w:]+$/.test(expr)) return input;
      const value = evaluateExpression(expr, env);
      let stored = value;
      if (type && /^I\d+$/.test(type)) {
        // simple integer cast
        stored = Math.trunc(value);
      }
      env.set(name, stored);
      lastResult = stored;
      continue;
    }

    // Expression or variable reference
    if (!/^[\d\s+\-*/().{}A-Za-z_\w]+$/.test(stmt)) return input;
    lastResult = evaluateExpression(stmt, env);
  }

  if (lastResult === undefined) return input;
  return String(lastResult);
}

export default interpret;

function evaluateExpression(expr: string, env: Map<string, number>) {
  let e = expr.trim();
  if (e.startsWith("{") && e.endsWith("}")) {
    e = e.slice(1, -1).trim();
  }
  const tokens = tokenize(e);
  const rpn = toRPN(tokens);
  return evalRPN(rpn, env);
}

function tokenize(expr: string): string[] {
  const re = /(?:\d+(?:\.\d+)?)|[A-Za-z_]\w*|[(){}+\-*/]/g;
  const raw = expr.match(re) || [];
  const tokens: string[] = [];

  let prev: string | undefined = undefined;
  for (const t of raw) {
    if (
      t === "-" &&
      (prev === undefined || prev === "(" || prev === "{" || isOperator(prev))
    ) {
      // unary minus -> treat as 0 - <expr>
      tokens.push("0");
      tokens.push("-");
      prev = "-";
      continue;
    }
    tokens.push(t);
    prev = t;
  }
  return tokens;
}

function isOperator(t: string) {
  return t === "+" || t === "-" || t === "*" || t === "/";
}

function toRPN(tokens: string[]): string[] {
  const out: string[] = [];
  const ops: string[] = [];
  const prec: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

  for (const t of tokens) {
    if (/^\d+(?:\.\d+)?$/.test(t) || /^[A-Za-z_]\w*$/.test(t)) {
      out.push(t);
      continue;
    }

    if (isOperator(t)) {
      while (
        ops.length &&
        isOperator(ops[ops.length - 1]) &&
        prec[ops[ops.length - 1]] >= prec[t]
      ) {
        out.push(ops.pop()!);
      }
      ops.push(t);
      continue;
    }

    if (t === "(" || t === "{") {
      ops.push(t);
      continue;
    }

    if (t === ")" || t === "}") {
      const open = t === ")" ? "(" : "{";
      while (ops.length && ops[ops.length - 1] !== open) out.push(ops.pop()!);
      if (ops.length && ops[ops.length - 1] === open) ops.pop();
      continue;
    }
  }

  while (ops.length) out.push(ops.pop()!);
  return out;
}

function evalRPN(rpn: string[], env: Map<string, number> = new Map()): number {
  const st: number[] = [];
  for (const t of rpn) {
    if (/^\d+(?:\.\d+)?$/.test(t)) {
      st.push(parseFloat(t));
      continue;
    }

    if (/^[A-Za-z_]\w*$/.test(t)) {
      if (!env.has(t)) throw new Error(`Undefined variable: ${t}`);
      st.push(env.get(t)!);
      continue;
    }
    const b = st.pop();
    const a = st.pop();
    if (a === undefined || b === undefined)
      throw new Error("Invalid expression");
    switch (t) {
      case "+":
        st.push(a + b);
        break;
      case "-":
        st.push(a - b);
        break;
      case "*":
        st.push(a * b);
        break;
      case "/":
        st.push(a / b);
        break;
      default:
        throw new Error("Unknown operator: " + t);
    }
  }
  if (st.length !== 1) throw new Error("Invalid expression result");
  return st[0];
}
