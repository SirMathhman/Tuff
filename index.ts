export function evaluate(input: string): number {
  if (input === "") return 0;
  return input
    .split("+")
    .reduce((sum, part) => sum + Number(part.trim()), 0);
}
