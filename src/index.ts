export function compile(source: string): string {
  source = source.trim();

  // Simple number literal
  const isNumber =
    source.length > 0 && source.split("").every((c) => c >= "0" && c <= "9");
  if (isNumber) {
    return "process.exit(" + source + ")";
  }

  // Read U8 instruction
  if (source === "read U8") {
    return "process.exit(parseInt(process.argv[2], 10))";
  }

  // Arithmetic operations with read U8
  if (source.includes("+")) {
    const parts = source.split("+").map((p) => p.trim());
    const result = parts.reduce((acc, part, index) => {
      const expr =
        part === "read U8"
          ? "parseInt(process.argv[" + (index + 2) + "], 10)"
          : part;
      return acc + (index === 0 ? expr : " + " + expr);
    }, "");
    return "process.exit(" + result + ")";
  }

  // Default: exit with 0
  return "process.exit(0)";
}
