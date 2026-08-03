export function evaluate(source: string) : number {
  if (source === "") {
    return 0;
  }

  const [left, operator, right] = source.split(" ");

  if (operator === "+") {
    return Number(left) + Number(right);
  }

  return Number(source);
}
