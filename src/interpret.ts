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
    if (!/^[-+]?\d+$/.test(numStr)) throw new Error("suffix requires integer value");
    const valueBig = BigInt(numStr);
    if (kind === 'u' || kind === 'U') {
      if (valueBig < 0n) throw new Error("negative numbers with suffixes are not allowed");
      const max = (1n << BigInt(bits)) - 1n;
      if (valueBig > max) throw new Error(`value out of range for U${bits}`);
      return { valueBig, kind: 'u', bits };
    }
    // signed
    const min = -(1n << BigInt(bits - 1));
    const max = (1n << BigInt(bits - 1)) - 1n;
    if (valueBig < min || valueBig > max) throw new Error(`value out of range for I${bits}`);
    return { valueBig, kind: 'i', bits };
  }

  // no suffix: accept float or integer
  if (numStr.includes('.')) {
    return { floatValue: Number(numStr), isFloat: true };
  }
  return { valueBig: BigInt(numStr), isFloat: false };
}

export function interpret(input: string): number {
  const s = input.trim();

  // Simple binary addition: <left> + <right>
  const expr = s.match(/^(.+?)\s*\+\s*(.+)$/);
  if (expr) {
    const leftTok = expr[1].trim();
    const rightTok = expr[2].trim();
    const left = parseOperand(leftTok);
    const right = parseOperand(rightTok);
    if (!left || !right) throw new Error('invalid operands for expression');

    // If both have suffix kinds, require same kind/bits and perform BigInt arithmetic with range check
    if ((left as any).kind && (right as any).kind) {
      const lk = (left as any).kind as string;
      const rk = (right as any).kind as string;
      const lbits = (left as any).bits as number;
      const rbits = (right as any).bits as number;
      if (lk !== rk || lbits !== rbits) throw new Error('mismatched suffixes in binary operation');
      const sum = (left as any).valueBig + (right as any).valueBig;
      if (lk === 'u') {
        const max = (1n << BigInt(lbits)) - 1n;
        if (sum < 0n || sum > max) throw new Error(`value out of range for U${lbits}`);
      } else {
        const min = -(1n << BigInt(lbits - 1));
        const max = (1n << BigInt(lbits - 1)) - 1n;
        if (sum < min || sum > max) throw new Error(`value out of range for I${lbits}`);
      }
      return Number(sum);
    }

    // Otherwise, handle floats or integers without suffixes
    const leftNum = (left as any).isFloat ? (left as any).floatValue : Number((left as any).valueBig);
    const rightNum = (right as any).isFloat ? (right as any).floatValue : Number((right as any).valueBig);
    return leftNum + rightNum;
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
