export function evaluate(input: string): number {
  if (input === "") return 0;
  return new Function(input)() as number;
}
