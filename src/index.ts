export function interpret(source: string): number {
  if (source === "") {
    return 0;
  }
  return parseInt(source, 10);
}
