export function evaluate(input: string): number {
  if (input === "") return 0;
  const num = Number(input);
  if (!Number.isNaN(num)) return num;

  const parts = input.split("+");
  if (parts.length === 2 && parts[0] !== undefined && parts[1] !== undefined) {
    return evaluate(parts[0]) + evaluate(parts[1]);
  }

  throw new Error("Not implemented");
}
