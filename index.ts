export function interpret(source: string) {
  if (source === "") {
    return 0;
  }
  return Number(source);
}
