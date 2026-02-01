type Result<T, E> = { success: true; data: T } | { success: false; error: E };

type Range = { min: number | bigint; max: number | bigint; unsigned: boolean };

const TYPE_RANGES: Record<string, Range> = {
  U8: { min: 0, max: 255, unsigned: true },
  U16: { min: 0, max: 65535, unsigned: true },
  U32: { min: 0, max: 4294967295, unsigned: true },
  U64: { min: 0n, max: 18446744073709551615n, unsigned: true },
  I8: { min: -128, max: 127, unsigned: false },
  I16: { min: -32768, max: 32767, unsigned: false },
  I32: { min: -2147483648, max: 2147483647, unsigned: false },
  I64: { min: -9223372036854775808n, max: 9223372036854775807n, unsigned: false },
};

function validateNumber(value: number | bigint, range: Range, typeName: string): Result<number | bigint, string> {
  if (range.unsigned && (typeof value === "number" ? value < 0 : value < 0n)) {
    return { success: false, error: `Negative numbers cannot have ${typeName} suffix` };
  }

  if (value < range.min || value > range.max) {
    return { success: false, error: `Number exceeds ${typeName} range (${range.min}-${range.max})` };
  }

  return { success: true, data: value };
}

export function interpret(input: string): Result<number | bigint, string> {
  const trimmedInput = input.trim();

  if (trimmedInput.includes(" + ")) {
    const parts = trimmedInput.split(" + ");
    if (parts.length === 2) {
      const leftResult = interpret(parts[0]);
      const rightResult = interpret(parts[1]);

      if (!leftResult.success) {
        return leftResult;
      }

      if (!rightResult.success) {
        return rightResult;
      }

      const left = leftResult.data;
      const right = rightResult.data;

      if (typeof left === "bigint" && typeof right === "bigint") {
        return { success: true, data: left + right };
      }

      if (typeof left === "number" && typeof right === "number") {
        return { success: true, data: left + right };
      }

      return { success: false, error: "Cannot add number and bigint together" };
    }
  }

  for (const [typeName, range] of Object.entries(TYPE_RANGES)) {
    if (trimmedInput.endsWith(typeName)) {
      const numberStr = trimmedInput.slice(0, -typeName.length);

      if (typeName === "U64" || typeName === "I64") {
        const value = BigInt(numberStr);
        return validateNumber(value, range, typeName);
      }

      const value = Number(numberStr);
      return validateNumber(value, range, typeName);
    }
  }

  return { success: true, data: Number(trimmedInput) };
}

