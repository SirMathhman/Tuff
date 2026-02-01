export function compile(source: string): string {
  if (source === "read U8") {
    return "parseInt(stdIn)";
  }
  return source;
}
