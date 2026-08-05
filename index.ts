export function evaluate(source: string): number {
  if (!source.trim()) return 0;
  const tokens = source.match(/(\d+|[+\-])/g)!;
  let result = parseInt(tokens[0], 10);
  for (let i = 1; i < tokens.length; i += 2) {
    const num = parseInt(tokens[i + 1]!, 10);
    result += tokens[i] === "+" ? num : -num;
  }
  return result;
}
