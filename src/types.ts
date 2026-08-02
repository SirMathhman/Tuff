// A minimal type system for Tuff.

export type Type =
  | { kind: "Number" }
  | { kind: "U8" }
  | { kind: "U16" }
  | { kind: "U32" }
  | { kind: "Str" }
  | { kind: "Ref"; inner: Type }
  | { kind: "Array"; inner: Type };

export const NumberType: Type = { kind: "Number" };
export const U8Type: Type = { kind: "U8" };
export const U16Type: Type = { kind: "U16" };
export const U32Type: Type = { kind: "U32" };
export const StrType: Type = { kind: "Str" };

export function ref(inner: Type): Type {
  return { kind: "Ref", inner };
}

export function array(inner: Type): Type {
  return { kind: "Array", inner };
}

// --- Integer type table ---
//
// A single source of truth for the unsigned integer types. Each entry carries
// the type's name, bit width, and maximum value. Everything else (range
// checking, widening, literal inference) is derived from this table, so adding
// a new integer type is a one-line change here.

export interface IntegerTypeInfo {
  kind: "U8" | "U16" | "U32";
  bits: number;
  max: number;
}

export const INTEGER_TYPES: Record<string, IntegerTypeInfo> = {
  U8: { kind: "U8", bits: 8, max: 255 },
  U16: { kind: "U16", bits: 16, max: 65535 },
  U32: { kind: "U32", bits: 32, max: 4294967295 },
};

/** Returns the integer type info for a suffix like `U8`, or undefined. */
export function integerTypeFromSuffix(
  suffix: string,
): IntegerTypeInfo | undefined {
  return INTEGER_TYPES[suffix];
}

/** Returns true if `type` is one of the unsigned integer types. */
export function isIntegerType(type: Type): boolean {
  return type.kind === "U8" || type.kind === "U16" || type.kind === "U32";
}

/**
 * Returns true if a value of type `actual` can be assigned to a slot of type
 * `expected`. Widening (U8 -> U16) is allowed; narrowing (U16 -> U8) is not.
 */
export function isAssignable(expected: Type, actual: Type): boolean {
  if (expected.kind === actual.kind) {
    return true;
  }
  // Widening: a smaller unsigned integer can be assigned to a larger one.
  if (isIntegerType(expected) && isIntegerType(actual)) {
    const expectedInfo = integerTypeFromSuffix(expected.kind);
    const actualInfo = integerTypeFromSuffix(actual.kind);
    return expectedInfo !== undefined && actualInfo !== undefined
      ? expectedInfo.bits > actualInfo.bits
      : false;
  }
  return false;
}

/**
 * Validates that an integer value fits within the range of the given suffix.
 * Throws a RangeError if it does not.
 */
export function checkIntegerRange(suffix: string, value: number): void {
  const info = integerTypeFromSuffix(suffix);
  if (info === undefined) {
    throw new Error(`Unknown integer suffix '${suffix}'`);
  }
  if (!Number.isInteger(value) || value < 0 || value > info.max) {
    throw new RangeError(
      `Value ${value} is out of range for ${suffix} (expected 0..${info.max})`,
    );
  }
}

export function typeToString(type: Type): string {
  switch (type.kind) {
    case "Number":
      return "Num";
    case "U8":
      return "U8";
    case "U16":
      return "U16";
    case "U32":
      return "U32";
    case "Str":
      return "Str";
    case "Ref":
      return `&${typeToString(type.inner)}`;
    case "Array":
      return `[${typeToString(type.inner)}]`;
  }
}
