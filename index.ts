export function interpretTuff(tuffSource: string): number {
  // Each term is an optional sign followed by digits, e.g. "2", "+ 3", "- 4".
  const terms = tuffSource.match(/[+-]?\s*\d+/g) ?? [];
  return terms
    .map((term) => Number(term.replace(/\s+/g, "")))
    .reduce((sum, term) => sum + term, 0);
}
