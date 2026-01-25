import { getTypeRange, validateTypeSuffixCompatibility } from "./type-utils";

export function isNumericLiteral(value: string): boolean {
  let i = 0;
  // Check for optional minus sign
  if (i < value.length && value[i] === "-") {
    i++;
  }

  // Check for at least one digit
  if (i >= value.length) return false;
  const ch = value[i]!;
  if (ch < "0" || ch > "9") {
    return false;
  }

  // Check remaining digits
  i++;
  while (i < value.length) {
    const nextCh = value[i]!;
    if (nextCh < "0" || nextCh > "9") {
      break;
    }
    i++;
  }

  // Check for optional type suffix (U8, I16, etc.)
  if (i < value.length) {
    const suffixStart = value[i]!;
    if ((suffixStart === "U" || suffixStart === "I") && i + 1 < value.length) {
      i++;
      // Check that all remaining characters are digits
      while (i < value.length) {
        const suffixCh = value[i]!;
        if (suffixCh < "0" || suffixCh > "9") {
          return false;
        }
        i++;
      }
    }
  }

  return i === value.length;
}

export function parseNumericLiteral(
  value: string,
): { numValue: bigint; suffix: string } {
  // Parse numeric value, optionally with type suffix like U8 or I32
  let i = 0;

  // Handle optional minus sign
  if (i < value.length && value[i] === "-") {
    i++;
  }

  // Skip digits
  while (i < value.length && value[i]! >= "0" && value[i]! <= "9") {
    i++;
  }

  // Extract the numeric part
  const numStr = value.slice(0, i);
  const numValue = BigInt(numStr);

  // The rest is the suffix
  const suffix = value.slice(i);

  return { numValue, suffix };
}

export function validateTypeAnnotation(
  value: string,
  typeAnnotation: string,
): void {
  if (isNumericLiteral(value)) {
    const { numValue, suffix } = parseNumericLiteral(value);
    const typeRange = getTypeRange(typeAnnotation);

    if (!typeRange) {
      return;
    }

    if (numValue < typeRange.min || numValue > typeRange.max) {
      if (!typeRange.isSigned && numValue < 0n) {
        throw new Error(
          `negative value ${numValue} is not valid for unsigned type ${typeAnnotation}`,
        );
      }
      throw new Error(
        `value ${numValue} is out of range for type ${typeAnnotation} (${typeRange.min} to ${typeRange.max})`,
      );
    }

    if (suffix) {
      validateTypeSuffixCompatibility(suffix, typeAnnotation);
    }
  }
}
