/**
 * Interpret function.
 * - If the input starts with a numeric value (integer or float), returns that numeric value.
 * - Otherwise returns 0.
 * This allows inputs with type suffixes like `100U8` to be parsed as 100.
 */
function parseOperand(token: string) {
  const s = token.trim();
  // Match integer or float with optional suffix attached (e.g., 123, 1.23, 100U8)
  const m = s.match(/^([+-]?\d+(?:\.\d+)?)([uUiI]\d+)?$/);
  if (!m) return null;
  const numStr = m[1];
  const suffix = m[2];

  if (suffix) {
    const sufMatch = suffix.match(/^([uUiI])(\d+)$/)!;
    const kind = sufMatch[1];
    const bits = Number(sufMatch[2]);
    // Suffix requires integer (no decimal part)
    if (!/^[-+]?\d+$/.test(numStr))
      throw new Error("suffix requires integer value");
    const valueBig = BigInt(numStr);
    if (kind === "u" || kind === "U") {
      if (valueBig < 0n)
        throw new Error("negative numbers with suffixes are not allowed");
      const max = (1n << BigInt(bits)) - 1n;
      if (valueBig > max) throw new Error(`value out of range for U${bits}`);
      return { valueBig, kind: "u", bits };
    }
    // signed
    const min = -(1n << BigInt(bits - 1));
    const max = (1n << BigInt(bits - 1)) - 1n;
    if (valueBig < min || valueBig > max)
      throw new Error(`value out of range for I${bits}`);
    return { valueBig, kind: "i", bits };
  }

  // no suffix: accept float or integer
  if (numStr.includes(".")) {
    return { floatValue: Number(numStr), isFloat: true };
  }
  return { valueBig: BigInt(numStr), isFloat: false };
}

export function interpret(input: string): number {
  const s = input.trim();

  // Handle addition expressions with one or more '+' operators
  const tokens = s.split(/\s*\+\s*/);
  if (tokens.length > 1) {
    const operands = tokens.map((t) => parseOperand(t.trim()));
    if (operands.some((op) => op === null))
      throw new Error("invalid operands for expression");

    // Helper to check range for a BigInt sum and return as number
    function checkRangeAndReturn(kind: string, bits: number, sum: bigint) {
      if (kind === "u") {
        const max = (1n << BigInt(bits)) - 1n;
        if (sum < 0n || sum > max) throw new Error(`value out of range for U${bits}`);
      } else {
        const min = -(1n << BigInt(bits - 1));
        const max = (1n << BigInt(bits - 1)) - 1n;
        if (sum < min || sum > max) throw new Error(`value out of range for I${bits}`);
      }
      return Number(sum);
    }

    // If all operands have kinds (suffixes), enforce same kind and bits and use BigInt arithmetic
    const allHaveKind = operands.every((op) => (op as any).kind);
    if (allHaveKind) {
      const firstKind = (operands[0] as any).kind as string;
      const firstBits = (operands[0] as any).bits as number;
      // ensure all match
      for (const op of operands) {
        if ((op as any).kind !== firstKind || (op as any).bits !== firstBits)
          throw new Error("mismatched suffixes in binary operation");
      }
      // sum with BigInt and check range
      const sum = operands.reduce((acc, op) => acc + (op as any).valueBig, 0n as bigint);
      return checkRangeAndReturn(firstKind, firstBits, sum);
    }

    // Handle mixed and unsuffixed cases
    const anyHaveKind = operands.some((op) => (op as any).kind);

    // If some operands have kinds (mixed), try to promote unsuffixed integers to BigInt
    if (anyHaveKind) {
      const firstSuf = operands.find((op) => (op as any).kind) as any;
      const firstKind = firstSuf.kind as string;
      const firstBits = firstSuf.bits as number;
      // ensure all suffixed operands match
      for (const op of operands) {
        if ((op as any).kind && ((op as any).kind !== firstKind || (op as any).bits !== firstBits))
          throw new Error("mismatched suffixes in binary operation");
      }
      // convert all operands to BigInt; non-suffixed must be integer
      const bigs = operands.map((op) => {
        if ((op as any).kind) return (op as any).valueBig as bigint;
        // non-suffixed: must be integer
        if ((op as any).isFloat) throw new Error("mixed suffix and float not allowed");
        return (op as any).valueBig as bigint;
      });
      const sum = bigs.reduce((a, b) => a + b, 0n as bigint);
      return checkRangeAndReturn(firstKind, firstBits, sum);
    }

    // All operands have no suffix: sum as numbers (floats or integers)
    const nums = operands.map((op) => {
      if ((op as any).isFloat) return (op as any).floatValue as number;
      return Number((op as any).valueBig as bigint);
    });
    return nums.reduce((a, b) => a + b, 0);
  }

  // fallback: single operand parse
  const single = parseOperand(s);
  if (!single) return 0;
  if ((single as any).kind) {
    const kind = (single as any).kind as string;
    const bits = (single as any).bits as number;
    const valueBig = (single as any).valueBig as bigint;
    return Number(valueBig);
  }
  if ((single as any).isFloat) return (single as any).floatValue as number;
  return Number((single as any).valueBig as bigint);
}
