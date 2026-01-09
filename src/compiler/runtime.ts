/**
 * Runtime support library for compiled Tuff code
 * Provides type checking, bounds validation, and specialized operations
 */

/**
 * Validate integer is within bounds for unsigned type
 */
export function checkU(bits: number, value: bigint): void {
  const max = (1n << BigInt(bits)) - 1n;
  if (value < 0n || value > max) {
    throw new Error(`Value ${value} out of range for u${bits}`);
  }
}

/**
 * Validate integer is within bounds for signed type
 */
export function checkI(bits: number, value: bigint): void {
  const maxVal = (1n << BigInt(bits - 1)) - 1n;
  const minVal = -(1n << BigInt(bits - 1));
  if (value < minVal || value > maxVal) {
    throw new Error(`Value ${value} out of range for i${bits}`);
  }
}

/**
 * Create typed integer with bounds checking
 */
export function makeInt(
  value: bigint | number,
  kind?: string,
  bits?: number
): bigint {
  const val = typeof value === "number" ? BigInt(value) : value;

  if (kind && bits) {
    if (kind === "u" || kind === "U") {
      checkU(bits, val);
    } else if (kind === "i" || kind === "I") {
      checkI(bits, val);
    }
  }

  return val;
}

/**
 * Convert value to number (for compatibility with interpret())
 */
export function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === undefined || value === null) return 0;
  return 0;
}

/**
 * Check if value is truthy (for conditionals)
 */
export function isTruthy(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "bigint") return value !== 0n;
  if (value === undefined || value === null) return false;
  return true;
}

/**
 * Runtime library export
 */
export const runtime = {
  checkU,
  checkI,
  makeInt,
  toNumber,
  isTruthy,
};
