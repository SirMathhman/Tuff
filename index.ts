export function evaluate(input: string): number {
  if (input === "") return 0;
  const num = Number(input);
  if (!Number.isNaN(num)) return num;

  const parts = input.split("+");
  if (parts.length >= 2) {
    let sum = 0;
    for (const part of parts) {
      if (part !== undefined) sum += evaluate(part);
    }
    return sum;
  }

  throw new Error("Not implemented");
}
