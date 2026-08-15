export function evaluate(input: string): number {
  const tokens = input.trim().match(/\d+|\+/g);
  if (!tokens) return 0;
  let total = Number(tokens[0]);
  for (let i = 1; i < tokens.length; i += 2) {
    total += Number(tokens[i + 1]);
  }
  return total;
}
