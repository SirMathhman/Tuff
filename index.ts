export function interpret(source: string) {
  if (source === "") {
    return 0;
  }
  if (source.includes("+")) {
    const [left, right] = source.split("+");
    return Number(left) + Number(right);
  }
  return Number(source);
}
