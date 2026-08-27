/**
 * The inclusive value range a suffixed number literal must fall in.
 */
interface SuffixRange {
  min: number;
  max: number;
}

/**
 * Marker for a suffix that is legal but has no checkable value range.
 */
interface UnboundedSuffix {
  unbounded: true;
}

/**
 * The value-range spec for a number suffix: either a bounded inclusive
 * range or an unbounded marker.
 */
type SuffixSpec = SuffixRange | UnboundedSuffix;

/**
 * The legal type suffixes a number literal may carry, with each integer
 * suffix's inclusive value range and an unbounded marker for the float
 * suffixes. The single source of truth for suffix validity and range;
 * `NumberSuffix` is derived from its keys so a typo'd key is a compile
 * error.
 */
const NUMBER_SUFFIXES = {
  U8: { min: 0, max: 255 },
  I8: { min: -128, max: 127 },
  U16: { min: 0, max: 65535 },
  I16: { min: -32768, max: 32767 },
  U32: { min: 0, max: 4294967295 },
  I32: { min: -2147483648, max: 2147483647 },
  U64: { min: 0, max: 2 ** 64 - 1 },
  I64: { min: -(2 ** 63), max: 2 ** 63 - 1 },
  F32: { unbounded: true },
  F64: { unbounded: true },
} satisfies Record<string, SuffixSpec>;

/**
 * The set of legal number-literal type suffixes, derived from the keys of
 * NUMBER_SUFFIXES.
 */
export type NumberSuffix = keyof typeof NUMBER_SUFFIXES;

/**
 * Check whether a string is a legal number-literal type suffix.
 * @param suffix - The suffix string to check.
 * @returns True if the suffix is a key of NUMBER_SUFFIXES.
 */
export function isNumberSuffix(suffix: string): suffix is NumberSuffix {
  return Object.hasOwn(NUMBER_SUFFIXES, suffix);
}

/**
 * Look up the value-range spec for a legal number suffix.
 * @param suffix - A legal number suffix.
 * @returns The suffix's SuffixSpec.
 */
export function suffixSpec(suffix: NumberSuffix): SuffixSpec {
  return NUMBER_SUFFIXES[suffix];
}
