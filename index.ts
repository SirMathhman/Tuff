export function interpretTuff(tuffSource: string): number {
  return tuffSource
    .split("+")
    .map((operand) => parseInt(operand, 10))
    .reduce((sum, operand) => sum + operand, 0);
}
