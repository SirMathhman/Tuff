export function evaluate(source: string) : number {
  if (source === "") {
    return 0;
  }

  const parts = source.split(" ");
  let index = 0;

  function parseTerm(): number {
    let value = Number(parts[index]);
    index++;

    while (index < parts.length && (parts[index] === "*")) {
      const operator = parts[index];
      index++;
      const operand = Number(parts[index]);
      index++;

      if (operator === "*") {
        value *= operand;
      }
    }

    return value;
  }

  let result = parseTerm();

  while (index < parts.length) {
    const operator = parts[index];
    index++;
    const operand = parseTerm();

    if (operator === "+") {
      result += operand;
    } else if (operator === "-") {
      result -= operand;
    }
  }

  return result;
}
