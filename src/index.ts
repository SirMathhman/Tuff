function isDigit(char: string): boolean {
  return char === "0" || char === "1" || char === "2" || char === "3" || char === "4" || char === "5" || char === "6" || char === "7" || char === "8" || char === "9";
}

function findDigitEndIndex(str: string, index: number): number {
  if (index >= str.length) {
    return index;
  }
  return isDigit(str[index]) ? findDigitEndIndex(str, index + 1) : index;
}

function startsWithNegativeTypedLiteral(source: string): boolean {
  if (!source.startsWith("-")) {
    return false;
  }
  const afterMinus = source.slice(1);
  if (!isDigit(afterMinus[0])) {
    return false;
  }
  const rest = afterMinus.slice(findDigitEndIndex(afterMinus, 1));
  return rest.startsWith("U8") || rest.startsWith("U16") || rest.startsWith("U32") || rest.startsWith("U64") || rest.startsWith("I8") || rest.startsWith("I16") || rest.startsWith("I32") || rest.startsWith("I64") || rest.startsWith("F32") || rest.startsWith("F64");
}

export function compileTuffToJS(source: string): string {
  if (startsWithNegativeTypedLiteral(source)) {
    throw new Error("Negative typed literals are not allowed");
  }
  // Parse numeric literals with optional type suffixes (e.g., 100U8)
  // For now, only support U8 suffix
  const parts = source.split("U8");
  const compiled = parts[0];
  return "return " + compiled + ";";
}
