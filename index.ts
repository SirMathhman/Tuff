export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (trimmed === "") {
    return 0;
  }
  const tokens = trimmed.match(/\d+|[+\-]/g) ?? [];
  let result = Number(tokens[0]);
  for (let i = 1; i < tokens.length; i += 2) {
    const operator = tokens[i];
    const value = Number(tokens[i + 1]);
    result = operator === "+" ? result + value : result - value;
  }
  return result;
}
