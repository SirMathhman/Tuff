type TypeSuffix =
  | "U8"
  | "U16"
  | "U32"
  | "U64"
  | "I8"
  | "I16"
  | "I32"
  | "I64"
  | null;

interface TypedLiteral {
  fullMatch: string;
  numberPart: string;
  suffix: TypeSuffix;
}

interface SuffixPosition {
  suffix: string;
  position: number;
}

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
  return (
    suffix === "I8" || suffix === "I16" || suffix === "I32" || suffix === "I64"
  );
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

function findNextSuffixPosition(
  source: string,
  suffixes: string[],
  fromIndex: number,
): SuffixPosition | null {
  const positions = suffixes
    .map((suffix) => ({ suffix, position: source.indexOf(suffix, fromIndex) }))
    .filter((item) => item.position !== -1)
    .sort((a, b) => a.position - b.position);
  return positions.length > 0 ? positions[0] : null;
}

function findNumberStart(source: string, suffixPos: number): number {
  const pos = suffixPos - 1;
  if (pos < 0 || !isDigit(source[pos])) {
    if (pos >= 0 && source[pos] === "-") {
      return pos;
    }
    return pos + 1;
  }
  return findNumberStart(source, pos);
}

function extractLiteralAtPosition(
  source: string,
  suffixPos: number,
  suffix: string,
): TypedLiteral | null {
  const numberStart = findNumberStart(source, suffixPos);
  if (numberStart === suffixPos) {
    return null;
  }
  const endPos = suffixPos + suffix.length;
  const fullMatch = source.slice(numberStart, endPos);
  const typedSuffix: TypeSuffix = extractTypeSuffix(suffix);
  return {
    fullMatch,
    numberPart: extractNumberPart(fullMatch, typedSuffix),
    suffix: typedSuffix,
  };
}

function replaceAllOccurrences(
  text: string,
  search: string,
  replace: string,
  index: number = 0,
): string {
  const foundIndex = text.indexOf(search, index);
  if (foundIndex === -1) {
    return text;
  }
  const newText =
    text.slice(0, foundIndex) +
    replace +
    text.slice(foundIndex + search.length);
  return replaceAllOccurrences(
    newText,
    search,
    replace,
    foundIndex + replace.length,
  );
}

function findAllTypedLiterals(source: string): TypedLiteral[] {
  const suffixes: string[] = [
    "U64",
    "U32",
    "U16",
    "U8",
    "I64",
    "I32",
    "I16",
    "I8",
  ];
  function findLiteralHelper(searchPos: number): TypedLiteral[] {
    const foundPosition = findNextSuffixPosition(source, suffixes, searchPos);
    if (foundPosition === null) {
      return [];
    }
    const literal = extractLiteralAtPosition(
      source,
      foundPosition.position,
      foundPosition.suffix,
    );
    const nextSearchPos = foundPosition.position + foundPosition.suffix.length;
    const restLiterals = findLiteralHelper(nextSearchPos);
    if (literal !== null) {
      return [literal].concat(restLiterals);
    }
    return restLiterals;
  }
  return findLiteralHelper(0);
}

function containsAnyDigit(str: string): boolean {
  return (
    str.indexOf("0") !== -1 ||
    str.indexOf("1") !== -1 ||
    str.indexOf("2") !== -1 ||
    str.indexOf("3") !== -1 ||
    str.indexOf("4") !== -1 ||
    str.indexOf("5") !== -1 ||
    str.indexOf("6") !== -1 ||
    str.indexOf("7") !== -1 ||
    str.indexOf("8") !== -1 ||
    str.indexOf("9") !== -1
  );
}

function validateNoMixedTypes(
  source: string,
  typedLiterals: TypedLiteral[],
): void {
  let sourceWithoutTypedLiterals = source;
  typedLiterals.forEach((literal) => {
    sourceWithoutTypedLiterals = replaceAllOccurrences(
      sourceWithoutTypedLiterals,
      literal.fullMatch,
      "",
    );
  });
  if (containsAnyDigit(sourceWithoutTypedLiterals)) {
    throw new Error("Cannot mix typed and untyped numeric literals");
  }
}

export function compileTuffToJS(source: string): string {
  const typedLiterals = findAllTypedLiterals(source);
  if (typedLiterals.length > 0) {
    validateNoMixedTypes(source, typedLiterals);
  }
  typedLiterals.forEach((literal) => {
    const num = Number(literal.numberPart);
    if (!isSigned(literal.suffix) && literal.numberPart.startsWith("-")) {
      throw new Error("Negative literals are not allowed for unsigned types");
    }
    if (!isInRange(num, literal.suffix)) {
      throw new Error(literal.suffix + " literals must be in valid range");
    }
  });
  const compiled = typedLiterals.reduce(
    (acc, literal) =>
      replaceAllOccurrences(acc, literal.fullMatch, literal.numberPart),
    source,
  );
  if (typedLiterals.length > 0) {
    const resultType = typedLiterals[0].suffix;
    const fn = new Function("return " + compiled + ";");
    const result = fn();
    if (!isInRange(result, resultType)) {
      throw new Error(
        resultType + " operation result must be in valid range, got " + result,
      );
    }
  }
  return "return " + compiled + ";";
}
