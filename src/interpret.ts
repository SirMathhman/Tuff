export function interpret(input: string): string {
  const trimmed = input.trim();

  // Check if it's a simple number
  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  // Handle arithmetic expressions using eval with strict validation
  // Only allow numbers, operators, and spaces
  if (!/^[\d\s+\-*/().]+$/.test(trimmed)) {
    return input;
  }

  try {
    const tokens = tokenize(trimmed);
    const rpn = toRPN(tokens);
    const value = evalRPN(rpn);
    if (Number.isFinite(value) && !Number.isNaN(value)) return String(value);
    return input;
  } catch {
    return input;
  }
}

export default interpret;

function tokenize(expr: string): string[] {
  const re = /(?:\d+(?:\.\d+)?)|[()+\-*/]/g;
  const raw = expr.match(re) || [];
  const tokens: string[] = [];

  let prev: string | null = null;
  for (const t of raw) {
    if (t === "-" && (prev === null || prev === "(" || isOperator(prev))) {
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
    if (/^\d+(?:\.\d+)?$/.test(t)) {
      out.push(t);
      continue;
    }

    if (isOperator(t)) {
      while (ops.length && isOperator(ops[ops.length - 1]) && prec[ops[ops.length - 1]] >= prec[t]) {
        out.push(ops.pop()!);
      }
      ops.push(t);
      continue;
    }

    if (t === "(") {
      ops.push(t);
      continue;
    }

    if (t === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") out.push(ops.pop()!);
      if (ops.length && ops[ops.length - 1] === "(") ops.pop();
      continue;
    }
  }

  while (ops.length) out.push(ops.pop()!);
  return out;
}

function evalRPN(rpn: string[]): number {
  const st: number[] = [];
  for (const t of rpn) {
    if (/^\d+(?:\.\d+)?$/.test(t)) {
      st.push(parseFloat(t));
      continue;
    }
    const b = st.pop();
    const a = st.pop();
    if (a === undefined || b === undefined) throw new Error("Invalid expression");
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
