export function interpret(source: string): number {
  if (source === "") {
    return 0;
  }
  // Extract numeric literal with optional type suffix (e.g., "100" or "100U8")
  let numEnd = 0;
  while (
    numEnd < source.length &&
    source.charCodeAt(numEnd) >= 48 && // '0'
    source.charCodeAt(numEnd) <= 57    // '9'
  ) {
    numEnd++;
  }
  if (numEnd > 0) {
    return parseInt(source.substring(0, numEnd), 10);
  }
  return parseInt(source, 10);
}
