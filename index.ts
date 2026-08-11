export function evaluate(input: string): number {
  if (input.trim() === "") return 0;

  const tokens = input.match(/(\d+|[+\-*/])/g);
  if (!tokens) return 0;

  // Pass 1: handle * and /
  const values: number[] = [parseFloat(tokens[0])];
  const ops: string[] = [];
  let i = 1;
  while (i < tokens.length) {
    const op = tokens[i]!;
    const val = parseFloat(tokens[i + 1]!);
    const last = values[values.length - 1] ?? 0;
    if (op === "*") {
      values[values.length - 1] = last * val;
    } else if (op === "/") {
      values[values.length - 1] = last / val;
    } else {
      ops.push(op);
      values.push(val);
    }
    i += 2;
  }

  // Pass 2: handle + and -
  let result = values[0] ?? 0;
  for (let j = 0; j < ops.length; j++) {
    const next = values[j + 1] ?? 0;
    if (ops[j] === "+") result += next;
    else if (ops[j] === "-") result -= next;
  }

  return result;
}
