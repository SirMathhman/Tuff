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

export function interpret(input: string): Result<number | bigint, string> {
  for (const [typeName, range] of Object.entries(TYPE_RANGES)) {
    if (input.endsWith(typeName)) {
      const numberStr = input.slice(0, -typeName.length);

      if (typeName === "U64" || typeName === "I64") {
        const value = BigInt(numberStr);

        if (range.unsigned && value < 0n) {
          return { success: false, error: `Negative numbers cannot have ${typeName} suffix` };
        }

        if (value < range.min || value > range.max) {
          return { success: false, error: `Number exceeds ${typeName} range (${range.min}-${range.max})` };
        }

        return { success: true, data: value };
      }

      const value = Number(numberStr);

      if (range.unsigned && value < 0) {
        return { success: false, error: `Negative numbers cannot have ${typeName} suffix` };
      }

      if (value < range.min || value > range.max) {
        return { success: false, error: `Number exceeds ${typeName} range (${range.min}-${range.max})` };
      }

      return { success: true, data: value };
    }
  }

  return { success: true, data: Number(input) };
}
  
console.log("Hello from TypeScript!");
