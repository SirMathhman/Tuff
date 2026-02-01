type TypeSuffix = "U8" | "U16" | "U32" | "U64" | "I8" | "I16" | "I32" | "I64" | null;

function extractTypeSuffix(source: string): TypeSuffix {
  if (source.endsWith("U8")) return "U8";
  if (source.endsWith("U16")) return "U16";
  if (source.endsWith("U32")) return "U32";
  if (source.endsWith("U64")) return "U64";
  if (source.endsWith("I8")) return "I8";
  if (source.endsWith("I16")) return "I16";
  if (source.endsWith("I32")) return "I32";
  if (source.endsWith("I64")) return "I64";
  return null;
}

function extractNumberPart(source: string, suffix: TypeSuffix): string {
  if (!suffix) {
    return source;
  }
  return source.slice(0, source.length - suffix.length);
}

function isSigned(suffix: TypeSuffix): boolean {
  return suffix === "I8" || suffix === "I16" || suffix === "I32" || suffix === "I64";
}

function isInRange(value: number, suffix: TypeSuffix): boolean {
  if (suffix === "U8") return value >= 0 && value <= 255;
  if (suffix === "U16") return value >= 0 && value <= 65535;
  if (suffix === "U32") return value >= 0 && value <= 4294967295;
  if (suffix === "U64") return value >= 0;
  if (suffix === "I8") return value >= -128 && value <= 127;
  if (suffix === "I16") return value >= -32768 && value <= 32767;
  if (suffix === "I32") return value >= -2147483648 && value <= 2147483647;
  if (suffix === "I64") return value >= -9223372036854775808;
  return true;
}

export function compileTuffToJS(source: string): string {
  const suffix = extractTypeSuffix(source);
  if (!suffix) {
    return "return " + source + ";";
  }
  const numStr = extractNumberPart(source, suffix);
  const num = Number(numStr);
  if (!isSigned(suffix) && numStr.startsWith("-")) {
    throw new Error("Negative literals are not allowed for unsigned types");
  }
  if (!isInRange(num, suffix)) {
    throw new Error(suffix + " literals must be in valid range");
  }
  return "return " + numStr + ";";
}
