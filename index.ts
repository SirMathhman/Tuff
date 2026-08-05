export function evaluate(source: string): number {
  if (!source.trim()) return 0;
  const tokens = source.match(/(\d+|[+\-*/])/g)!;

  // First pass: resolve * and / (higher precedence)
  let terms: number[] = [parseInt(tokens[0], 10)];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i]!;
    const num = parseInt(tokens[i + 1]!, 10);
    if (op === "*") terms.push(terms.pop()! * num);
    else if (op === "/") terms.push(terms.pop()! / num);
    else {
      // Push operator as negative number for later sum: "+" → push +num, "-" → push -num
      terms.push(op === "+" ? num : -num);
    }
  }

  return terms.reduce((sum, t) => sum + t, 0);
}
