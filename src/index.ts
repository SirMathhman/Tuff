export function evaluateTuff(tuffSource: string): number {
  const trimmed = tuffSource.trim();
  if (trimmed === "") {
    return 0;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : 0;
}
