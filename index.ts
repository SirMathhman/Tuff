export function interpret(source: string): number {
  const tokens = source.split(" ");
  let result = Number(tokens[0]);
  for (let i = 1; i < tokens.length; i += 2) {
    const operator = tokens[i];
    const operand = Number(tokens[i + 1]);
    if (operator === "+") {
      result += operand;
    } else if (operator === "-") {
      result -= operand;
    }
  }
  return result;
}
