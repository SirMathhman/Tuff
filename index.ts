export function interpretTuff(tuffSource: string): number {
  const source = tuffSource.trim();
  if (/^\d+$/.test(source)) {
    return Number(source);
  }
  throw new Error(`Unsupported Tuff source: ${tuffSource}`);
}
