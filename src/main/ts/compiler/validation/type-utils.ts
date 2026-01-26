export const TYPE_RANGES: Record<
  string,
  { min: bigint; max: bigint; isSigned: boolean }
> = {
  U8: { min: 0n, max: 255n, isSigned: false },
  U16: { min: 0n, max: 65535n, isSigned: false },
  U32: { min: 0n, max: 4294967295n, isSigned: false },
  U64: { min: 0n, max: 18446744073709551615n, isSigned: false },
  I8: { min: -128n, max: 127n, isSigned: true },
  I16: { min: -32768n, max: 32767n, isSigned: true },
  I32: { min: -2147483648n, max: 2147483647n, isSigned: true },
  I64: {
    min: -9223372036854775808n,
    max: 9223372036854775807n,
    isSigned: true,
  },
};

export function getTypeRange(
  type: string,
): { min: bigint; max: bigint; isSigned: boolean } | undefined {
  return TYPE_RANGES[type];
}

export function validateTypeConstraint(suffix: string, value: bigint): void {
  const range = TYPE_RANGES[suffix];
  if (!range) {
    return; // Unknown type, skip validation
  }

  if (value < range.min || value > range.max) {
    if (!range.isSigned && value < 0n) {
      throw new Error(
        `negative value -${Math.abs(Number(value))} is not valid for unsigned type ${suffix}`,
      );
    }
    throw new Error(
      `value ${value} is out of range for type ${suffix} (${range.min} to ${range.max})`,
    );
  }
}

export function validateTypeSuffixCompatibility(
  valueSuffix: string,
  targetType: string,
): void {
  const valueRange = getTypeRange(valueSuffix);
  const targetRange = getTypeRange(targetType);

  if (!valueRange || !targetRange) {
    return;
  }

  // Check if value type fits in target type
  if (valueRange.max > targetRange.max || valueRange.min < targetRange.min) {
    throw new Error(
      `Cannot assign ${valueSuffix} to ${targetType} - type range mismatch`,
    );
  }
}
