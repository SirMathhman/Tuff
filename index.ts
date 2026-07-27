const PRECEDENCE: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };
const OPENERS = ["(", "{"];
const CLOSERS = [")", "}"];

function applyOp(values: number[], ops: string[]): void {
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

export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (trimmed === "") return 0;

  const tokens = trimmed.match(/\d+|[+\-*/(){}]/g);
  if (!tokens || tokens.length === 0) return 0;

  const values: number[] = [];
  const ops: string[] = [];

  for (const token of tokens) {
    if (OPENERS.includes(token)) {
      ops.push(token);
    } else if (CLOSERS.includes(token)) {
      while (ops.length > 0 && !OPENERS.includes(ops[ops.length - 1]!)) {
        applyOp(values, ops);
      }
      ops.pop();
    } else if (PRECEDENCE[token] !== undefined) {
      while (
        ops.length > 0 &&
        !OPENERS.includes(ops[ops.length - 1]!) &&
        PRECEDENCE[ops[ops.length - 1] as string]! >= PRECEDENCE[token]
      ) {
        applyOp(values, ops);
      }
      ops.push(token);
    } else {
      values.push(Number(token));
    }
  }

  while (ops.length > 0) {
    applyOp(values, ops);
  }

  return values[0] ?? 0;
}
