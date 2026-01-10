import { Result, Ok, Err } from "./result.js";

type TypeRange = {
  min: number | bigint;
  max: number | bigint;
};

const TYPE_RANGES: Record<string, TypeRange> = {
  U8: { min: 0, max: 255 },
  U16: { min: 0, max: 65535 },
  U32: { min: 0, max: 4294967295 },
  U64: { min: 0n, max: 18446744073709551615n },
  I8: { min: -128, max: 127 },
  I16: { min: -32768, max: 32767 },
  I32: { min: -2147483648, max: 2147483647 },
  I64: { min: -9223372036854775808n, max: 9223372036854775807n },
};

export function interpret(input: string): Result<number, string> {
  // Extract type suffix if present
  const typeMatch = input.match(/([A-Za-z]\d+)$/);
  const typePrefix = typeMatch ? typeMatch[1] : undefined;

  // Check if type suffix is unknown
  if (typePrefix && !TYPE_RANGES[typePrefix]) {
    return Err(`Unknown type: ${typePrefix}`);
  }

  // Check for negative numbers with unsigned type suffixes
  if (input.startsWith("-") && typePrefix && typePrefix.startsWith("U")) {
    return Err(
      `Invalid literal: negative numbers cannot have unsigned type suffix ${typePrefix}`
    );
  }

  // Remove type suffixes (e.g., U8, I32, etc.)
  const stripped = input.replace(/[A-Za-z]\d+$/, "");
  const num = parseInt(stripped, 10);

  // Validate against type constraints
  if (typePrefix && TYPE_RANGES[typePrefix]) {
    const range = TYPE_RANGES[typePrefix];
    if (num < range.min || num > range.max) {
      return Err(
        `Invalid literal: value ${num} is out of range for ${typePrefix} (${range.min}-${range.max})`
      );
    }
  }

  return Ok(num);
}
