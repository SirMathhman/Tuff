// Simple arithmetic expression evaluator using shunting-yard and RPN evaluation.
function evaluateArithmetic(expr: string): number | null {
  const tokens: string[] = [];
  const tokenRegex = /\s*([0-9]*\.?[0-9]+|[()+\-*/])\s*/g;
  let m: RegExpExecArray | null;
  let lastToken: string | null = null;

  while ((m = tokenRegex.exec(expr)) !== null) {
    let token = m[1];
    // handle unary minus: convert a leading or operator-following '-' to unary negation by attaching to number
    if (token === "-" && (lastToken === null || /[+\-*/(]/.test(lastToken))) {
      // try to capture the following number directly
      const numMatch = /\s*([0-9]*\.?[0-9]+)/y;
      numMatch.lastIndex = tokenRegex.lastIndex;
      const num = numMatch.exec(expr);
      if (num) {
        token = "-" + num[1];
        tokenRegex.lastIndex = numMatch.lastIndex;
      }
    }

    tokens.push(token);
    lastToken = token;
  }

  if (tokens.length === 0) return null;

  const precedence: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };
  const outputQueue: string[] = [];
  const opStack: string[] = [];

  for (const token of tokens) {
    if (/^[+-]?[0-9]*\.?[0-9]+$/.test(token)) {
      outputQueue.push(token);
      continue;
    }

    if (token === "+" || token === "-" || token === "*" || token === "/") {
      while (
        opStack.length > 0 &&
        opStack[opStack.length - 1] !== "(" &&
        precedence[opStack[opStack.length - 1]] >= precedence[token]
      ) {
        outputQueue.push(opStack.pop()!);
      }
      opStack.push(token);
      continue;
    }

    if (token === "(") {
      opStack.push(token);
      continue;
    }

    if (token === ")") {
      while (opStack.length > 0 && opStack[opStack.length - 1] !== "(") {
        outputQueue.push(opStack.pop()!);
      }
      if (opStack.length === 0 || opStack.pop() !== "(") {
        return null; // mismatched parentheses
      }
      continue;
    }

    // unknown token
    return null;
  }

  while (opStack.length > 0) {
    const op = opStack.pop()!;
    if (op === "(" || op === ")") return null;
    outputQueue.push(op);
  }

  const evalStack: number[] = [];
  for (const token of outputQueue) {
    if (/^[+-]?[0-9]*\.?[0-9]+$/.test(token)) {
      evalStack.push(Number(token));
      continue;
    }

    if (token === "+" || token === "-" || token === "*" || token === "/") {
      if (evalStack.length < 2) return null;
      const b = evalStack.pop()!;
      const a = evalStack.pop()!;
      let r = 0;
      if (token === "+") r = a + b;
      if (token === "-") r = a - b;
      if (token === "*") r = a * b;
      if (token === "/") r = a / b;
      evalStack.push(r);
      continue;
    }

    return null;
  }

  if (evalStack.length !== 1) return null;
  return evalStack[0];
}

export function interpret(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") return "";

  // If the input is a plain number, return it unchanged
  const numberOnly = /^[+-]?\d+(?:\.\d+)?$/.test(trimmed);
  if (numberOnly) return trimmed;

  // Allow only numbers, whitespace and arithmetic operators so we can safely evaluate
  const safeExpr = /^[0-9+\-*/().\s]+$/.test(trimmed);
  if (!safeExpr) return input;

  const value = evaluateArithmetic(trimmed);
  if (value === null || !Number.isFinite(value)) return input;

  // Return integer without trailing .0
  return Number.isInteger(value) ? String(value) : String(value);
}
