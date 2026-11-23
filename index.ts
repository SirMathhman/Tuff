export function interpretTuff(tuffSource: string): number {
  return tuffSource
    .split("+")
    .map((part) => Number(part))
    .reduce((sum, value) => sum + value);
}

// TODO: simple repl with interpretTuff
