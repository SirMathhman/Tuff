export function evaluate(source: string): number {
  if (source === "") return 0;
  throw new Error("Invalid source: " + source);
}
