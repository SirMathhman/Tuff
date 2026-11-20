export function interpretTuff(tuffSource: string): number {
  const terms = tuffSource.replace(/\s/g, "").match(/[+-]?\d+/g) ?? [];
  return terms
    .map((term) => parseInt(term, 10))
    .reduce((sum, term) => sum + term, 0);
}
