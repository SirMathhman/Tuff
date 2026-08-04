export function evaluate(source: string): number {
  const tokens = source.trim().split(/\s+/);
  if (tokens.length === 1 && tokens[0] === "") {
    return 0;
  }
  let result = Number(tokens[0]);
  for (let i = 1; i < tokens.length; i += 2) {
    const operator = tokens[i];
    const operand = Number(tokens[i + 1]);
    if (operator === "+") {
      result += operand;
    }
  }
  return result;
}
