export function splitTopLevelStatements(str: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "(" || ch === "{") depth++;
    else if (ch === ")" || ch === "}") depth = Math.max(0, depth - 1);
    else if (ch === ";" && depth === 0) {
      parts.push(str.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(str.slice(start));
  return parts;
}

export function parseOperand(token: string) {
  const s = token.trim();
  // boolean literals
  if (/^true$/i.test(s)) return { boolValue: true };
  if (/^false$/i.test(s)) return { boolValue: false };

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

export function parseOperandAt(src: string, pos: number) {
  // Try numeric/suffixed literal or boolean literal first
  const m = src
    .slice(pos)
    .match(/^([+-]?\d+(?:\.\d+)?(?:[uUiI]\d+)?|true|false)/i);
  if (m) {
    const operand = parseOperand(m[1]);
    if (!operand) throw new Error("invalid operand");
    return { operand, len: m[1].length };
  }
  // fallback: identifier
  const id = src.slice(pos).match(/^([a-zA-Z_]\w*)/);
  if (id) return { operand: { ident: id[1] }, len: id[1].length };
  return null;
}
