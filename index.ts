export function evaluate(input: string): number {
  if (input === "") return 0;
  throw new Error(`evaluate: unhandled input: ${JSON.stringify(input)}`);
}
