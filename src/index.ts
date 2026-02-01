export function compileTuffToJS(source: string): string {
  // Parse numeric literals with optional type suffixes (e.g., 100U8)
  // For now, only support U8 suffix
  const parts = source.split("U8");
  const compiled = parts[0];
  return "return " + compiled + ";";
}
