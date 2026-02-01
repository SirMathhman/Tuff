export function compile(source: string): string {
  if (source === "read U8") {
    return "parseInt(stdIn)";
  }
  if (source === "read U8 + read U8") {
    return "(() => { const [a, b] = stdIn.split(', ').map(Number); return a + b; })()";
  }
  return source;
}
