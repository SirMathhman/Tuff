const OPS: Record<
  string,
  { prec: number; apply: (a: number, b: number) => number }
> = {
  "+": { prec: 1, apply: (a, b) => a + b },
  "-": { prec: 1, apply: (a, b) => a - b },
  "*": { prec: 2, apply: (a, b) => a * b },
  "/": { prec: 2, apply: (a, b) => a / b },
};

export function evaluate(input: string): number {
  const trimmed = input.trim();
  if (trimmed.endsWith(";")) return 0;
  const normalized = input.replace(/\{/g, "(").replace(/\}/g, ")");
  const tokens = normalized.trim().match(/\d+|[+\-*/()]/g);
  if (!tokens) return 0;

  const output: number[] = [];
  const ops: string[] = [];

  for (const tok of tokens) {
    if (/^\d+$/.test(tok)) {
      output.push(Number(tok));
    } else if (tok === "(") {
      ops.push(tok);
    } else if (tok === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") {
        applyOp(output, ops.pop()!);
      }
      ops.pop(); // discard "("
    } else {
      const cur = OPS[tok]!;
      while (
        ops.length &&
        ops[ops.length - 1] !== "(" &&
        OPS[ops[ops.length - 1]!]!.prec >= cur.prec
      ) {
        applyOp(output, ops.pop()!);
      }
      ops.push(tok);
    }
  }
  while (ops.length) applyOp(output, ops.pop()!);

  return output.length ? output[output.length - 1]! : 0;
}

function applyOp(output: number[], op: string) {
  const b = output.pop()!;
  const a = output.pop()!;
  output.push(OPS[op]!.apply(a, b));
}
