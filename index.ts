export function compileTuffToJS(tuffSource: string): string {
  const trimmed = tuffSource.trim();
  const lastToken = trimmed.split(/\s+/).pop();
  if (lastToken !== undefined && /^-?\d+$/.test(lastToken)) {
    return `return ${lastToken};`;
  }
  return "return 0;";
}
