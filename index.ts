export function evaluate(input: string): number {
  const tokens = input.trim().match(/\d+|[+\-*/]/g);
  if (!tokens) return 0;

  // First pass: resolve * and / left to right
  const reduced: string[] = [tokens[0]];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const next = tokens[i + 1];
    if (op === "*" || op === "/") {
      const prev = Number(reduced.pop());
      reduced.push(
        String(op === "*" ? prev * Number(next!) : prev / Number(next!)),
      );
    } else {
      reduced.push(op!, next!);
    }
  }

  // Second pass: resolve + and - left to right
  let total = Number(reduced[0]);
  for (let i = 1; i < reduced.length; i += 2) {
    const op = reduced[i];
    const next = Number(reduced[i + 1]);
    total = op === "+" ? total + next : total - next;
  }
  return total;
}
