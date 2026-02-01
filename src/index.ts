export function compile(source: string): string {
  source = source.trim();

  // Simple number literal
  const isNumber = source.length > 0 && source.split("").every((c) => c >= "0" && c <= "9");
  if (isNumber) {
    return "process.exit(" + source + ")";
  }
  
  // Read U8 instruction
  if (source === "read U8") {
    return "process.exit(parseInt(process.argv[2], 10))";
  }
  
  // Default: exit with 0
  return "process.exit(0)";
}