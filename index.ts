export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (trimmed === "") return 0;

  const tokens = trimmed.match(/\d+|[+\-*/()]/g);
  if (!tokens || tokens.length === 0) return 0;

  const values: number[] = [];
  const ops: string[] = [];
  const precedence: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

  function applyOp(): void {
    const b = values.pop()!;
    const a = values.pop()!;
    const op = ops.pop()!;
    let result = 0;
    if (op === "+") result = a + b;
    else if (op === "-") result = a - b;
    else if (op === "*") result = a * b;
    else if (op === "/") result = a / b;
    values.push(result);
  }

  for (const token of tokens) {
    if (token === "(") {
      ops.push(token);
    } else if (token === ")") {
      while (ops.length > 0 && ops[ops.length - 1] !== "(") {
        applyOp();
      }
      ops.pop(); // remove "("
    } else if (precedence[token] !== undefined) {
      while (
        ops.length > 0 &&
        ops[ops.length - 1] !== "(" &&
        precedence[ops[ops.length - 1] as string]! >= precedence[token]
      ) {
        applyOp();
      }
      ops.push(token);
    } else {
      values.push(Number(token));
    }
  }

  while (ops.length > 0) {
    applyOp();
  }

  return values[0] ?? 0;
}
