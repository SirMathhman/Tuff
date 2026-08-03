export function evaluate(source: string) : number {
  if (source === "") {
    return 0;
  }

  const parts = source.split(" ");
  let result = Number(parts[0]);

  for (let i = 1; i < parts.length; i += 2) {
    const operator = parts[i];
    const operand = Number(parts[i + 1]);

    if (operator === "+") {
      result += operand;
    }
  }

  return result;
}
