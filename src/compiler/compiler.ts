/**
 * Compile Tuff source code to JavaScript string
 * @param _source Tuff source code
 * @returns JavaScript code as a string
 */
export function compile(_source: string): string {
  const source = _source.trim();

  // Empty source compiles to empty script
  if (!source) {
    return "";
  }

  let js = source;

  // Replace boolean literals: true -> 1, false -> 0
  // Do this character by character to avoid replacing inside words
  let result = "";
  let i = 0;
  while (i < js.length) {
    if (js.slice(i, i + 4) === "true") {
      if (
        (i === 0 || !isIdentifierChar(js[i - 1])) &&
        (i + 4 >= js.length || !isIdentifierChar(js[i + 4]))
      ) {
        result += "1";
        i += 4;
        continue;
      }
    }
    if (js.slice(i, i + 5) === "false") {
      if (
        (i === 0 || !isIdentifierChar(js[i - 1])) &&
        (i + 5 >= js.length || !isIdentifierChar(js[i + 5]))
      ) {
        result += "0";
        i += 5;
        continue;
      }
    }
    result += js[i];
    i++;
  }

  js = result;

  // Remove type suffixes (U8, U16, U32, U64, I8, I16, I32, I64, Bool, Char)
  // Also validate numeric ranges against type constraints
  result = "";
  i = 0;
  while (i < js.length) {
    // Check for minus sign (unary negation)
    let isNegative = false;
    if (js[i] === "-" && i + 1 < js.length && isDigit(js[i + 1])) {
      isNegative = true;
      result += js[i];
      i++;
    }

    if (isDigit(js[i])) {
      // Found start of number, collect all digits and type suffix
      const numStart = i;
      while (i < js.length && isDigit(js[i])) {
        i++;
      }
      const numStr = js.slice(numStart, i);
      const numValue = BigInt(numStr);
      const finalValue = isNegative ? -numValue : numValue;

      // Check for type suffix
      let suffix = "";
      if (i < js.length && (js[i] === "U" || js[i] === "I")) {
        const typeStart = i;
        i++;
        while (i < js.length && isDigit(js[i])) {
          i++;
        }
        suffix = js.slice(typeStart, i);
        validateTypeConstraint(suffix, finalValue);
      }

      // Add number without suffix
      result += numStr;
    } else {
      result += js[i];
      i++;
    }
  }

  js = result;

  // Wrap in parentheses to capture return value from eval
  return `(${js})`;
}

function validateTypeConstraint(suffix: string, value: bigint): void {
  const typeRanges: Record<string, { min: bigint; max: bigint; isSigned: boolean }> = {
    U8: { min: 0n, max: 255n, isSigned: false },
    U16: { min: 0n, max: 65535n, isSigned: false },
    U32: { min: 0n, max: 4294967295n, isSigned: false },
    U64: { min: 0n, max: 18446744073709551615n, isSigned: false },
    I8: { min: -128n, max: 127n, isSigned: true },
    I16: { min: -32768n, max: 32767n, isSigned: true },
    I32: { min: -2147483648n, max: 2147483647n, isSigned: true },
    I64: { min: -9223372036854775808n, max: 9223372036854775807n, isSigned: true },
  };

  const range = typeRanges[suffix];
  if (!range) {
    return; // Unknown type, skip validation
  }

  if (value < range.min || value > range.max) {
    if (!range.isSigned && value < 0n) {
      throw new Error(
        `negative value -${Math.abs(Number(value))} is not valid for unsigned type ${suffix}`
      );
    }
    throw new Error(`value ${value} is out of range for type ${suffix} (${range.min} to ${range.max})`);
  }
}

function isIdentifierChar(ch: string | undefined): boolean {
  if (!ch) return false;
  return (
    (ch >= "a" && ch <= "z") ||
    (ch >= "A" && ch <= "Z") ||
    (ch >= "0" && ch <= "9") ||
    ch === "_"
  );
}

function isDigit(ch: string | undefined): boolean {
  if (!ch) return false;
  return ch >= "0" && ch <= "9";
}

/**
 * Execute Tuff source code by compiling and evaluating
 * @param source Tuff source code
 * @returns The numeric result of execution
 */
export function execute(source: string): number {
  const js = compile(source);

  const result = eval(js);
  return typeof result === "number" ? result : 0;
}
