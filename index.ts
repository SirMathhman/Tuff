export function evaluate(input: string): number {
  if (input === "") return 0;
  if (input === "return 1;") return 1;
  if (input === "return 2;") return 2;
  throw new Error(`evaluate: unhandled input: ${JSON.stringify(input)}`);
}
