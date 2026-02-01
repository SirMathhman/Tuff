function isDigit(char: string): boolean {
  return (
    char === "0" ||
    char === "1" ||
    char === "2" ||
    char === "3" ||
    char === "4" ||
    char === "5" ||
    char === "6" ||
    char === "7" ||
    char === "8" ||
    char === "9"
  );
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
  return (
    rest.startsWith("U8") ||
    rest.startsWith("U16") ||
    rest.startsWith("U32") ||
    rest.startsWith("U64") ||
    rest.startsWith("I8") ||
    rest.startsWith("I16") ||
    rest.startsWith("I32") ||
    rest.startsWith("I64") ||
    rest.startsWith("F32") ||
    rest.startsWith("F64")
  );
}

function isU8OutOfRange(value: number): boolean {
  return value > 255;
}

function extractNumberFromU8Literal(source: string): string {
  const parts = source.split("U8");
  return parts[0];
}

export function compileTuffToJS(source: string): string {
  if (startsWithNegativeTypedLiteral(source)) {
    throw new Error("Negative typed literals are not allowed");
  }
  if (source.includes("U8")) {
    const numStr = extractNumberFromU8Literal(source);
    const num = Number(numStr);
    if (isU8OutOfRange(num)) {
      throw new Error("U8 literals must be in range 0-255");
    }
    return "return " + numStr + ";";
  }
  const parts = source.split("U8");
  const compiled = parts[0];
  return "return " + compiled + ";";
}
