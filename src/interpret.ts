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

  // Parse and evaluate expressions with '+' and '-' (left-associative)
  // We'll parse tokens: operand (operator operand)* and evaluate left to right.
  const exprTokens: { op?: string; operand?: any }[] = [];
  let idx = 0;
  const len = s.length;
  function skipSpacesLocal() {
    while (idx < len && s[idx] === " ") idx++;
  }
  skipSpacesLocal();
  const firstMatch = s.slice(idx).match(/^([+-]?\d+(?:\.\d+)?(?:[uUiI]\d+)?)/);
  if (firstMatch) {
    exprTokens.push({ operand: parseOperand(firstMatch[1]) });
    if (!exprTokens[0].operand) throw new Error("invalid operand");
    idx += firstMatch[1].length;
    skipSpacesLocal();
    while (idx < len) {
      const ch = s[idx];
      if (ch !== "+" && ch !== "-" && ch !== "*") break;
      const op = ch;
      idx++;
      skipSpacesLocal();
      const m = s.slice(idx).match(/^([+-]?\d+(?:\.\d+)?(?:[uUiI]\d+)?)/);
      if (!m) throw new Error("invalid operand after operator");
      const operand = parseOperand(m[1]);
      if (!operand) throw new Error("invalid operand");
      exprTokens.push({ op, operand });
      idx += m[1].length;
      skipSpacesLocal();
    }
  }

  if (exprTokens.length > 1) {
    // helper to check range and throw
    function checkRangeThrow(kind: string, bits: number, sum: bigint) {
      if (kind === "u") {
        const max = (1n << BigInt(bits)) - 1n;
        if (sum < 0n || sum > max)
          throw new Error(`value out of range for U${bits}`);
      } else {
        const min = -(1n << BigInt(bits - 1));
        const max = (1n << BigInt(bits - 1)) - 1n;
        if (sum < min || sum > max)
          throw new Error(`value out of range for I${bits}`);
      }
    }

    let current: any = exprTokens[0].operand;
    for (let i = 1; i < exprTokens.length; i++) {
      const op = exprTokens[i].op!;
      const nxt = exprTokens[i].operand;

      const curHasKind = (current as any).kind !== undefined;
      const nxtHasKind = (nxt as any).kind !== undefined;

      if (curHasKind || nxtHasKind) {
        const refer = curHasKind ? current : nxt;
        const kind = (refer as any).kind as string;
        const bits = (refer as any).bits as number;
        if (curHasKind && nxtHasKind) {
          if (
            (current as any).kind !== (nxt as any).kind ||
            (current as any).bits !== (nxt as any).bits
          )
            throw new Error("mismatched suffixes in binary operation");
        }
        if (!curHasKind && (current as any).isFloat)
          throw new Error("mixed suffix and float not allowed");
        if (!nxtHasKind && (nxt as any).isFloat)
          throw new Error("mixed suffix and float not allowed");

        let curBig: bigint;
        if (curHasKind) {
          curBig = (current as any).valueBig as bigint;
        } else if (typeof current === "number") {
          if (!Number.isInteger(current))
            throw new Error("mixed suffix and float not allowed");
          curBig = BigInt(current);
        } else {
          curBig = (current as any).valueBig as bigint;
        }

        let nxtBig: bigint;
        if (nxtHasKind) {
          nxtBig = (nxt as any).valueBig as bigint;
        } else if (typeof nxt === "number") {
          if (!Number.isInteger(nxt))
            throw new Error("mixed suffix and float not allowed");
          nxtBig = BigInt(nxt as number);
        } else {
          nxtBig = (nxt as any).valueBig as bigint;
        }

        let result: bigint;
        if (op === "+") result = curBig + nxtBig;
        else if (op === "-") result = curBig - nxtBig;
        else if (op === "*") result = curBig * nxtBig;
        else throw new Error("unsupported operator");
        checkRangeThrow(kind, bits, result);
        current = { valueBig: result, kind: kind, bits: bits };
      } else {
        const leftNum = (current as any).isFloat
          ? (current as any).floatValue
          : Number((current as any).valueBig);
        const rightNum = (nxt as any).isFloat
          ? (nxt as any).floatValue
          : Number((nxt as any).valueBig);
        let res: number;
        if (op === "+") res = leftNum + rightNum;
        else if (op === "-") res = leftNum - rightNum;
        else if (op === "*") res = leftNum * rightNum;
        else throw new Error("unsupported operator");
        current = Number(res);
      }
    }

    if ((current as any).kind) return Number((current as any).valueBig);
    if (typeof current === "number") return current;
    if ((current as any).isFloat) return (current as any).floatValue as number;
    return Number((current as any).valueBig as bigint);
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
