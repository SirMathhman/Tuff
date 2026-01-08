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
  // Support unary address-of '&' and dereference '*' prefixes (allow multiple)
  let i = pos;
  let prefixes: string[] = [];
  while (i < src.length && /[\s]/.test(src[i])) i++;
  while (i < src.length && (src[i] === "&" || src[i] === "*")) {
    prefixes.push(src[i]);
    i++;
    while (i < src.length && /[\s]/.test(src[i])) i++;
  }

  // Try numeric/suffixed literal or boolean literal first
  const m = src
    .slice(i)
    .match(/^([+-]?\d+(?:\.\d+)?(?:[uUiI]\d+)?|true|false)/i);
  function applyPrefixes(operand: any, prefixes: string[]) {
    let op = operand;
    for (let p = prefixes.length - 1; p >= 0; p--) {
      const pr = prefixes[p];
      if (pr === "&") op = { addrOf: op };
      else op = { deref: op };
    }
    return op;
  }

  if (m) {
    const innerOperand = parseOperand(m[1]);
    if (!innerOperand) throw new Error("invalid operand");
    const operand = applyPrefixes(innerOperand, prefixes);
    return { operand, len: i - pos + m[1].length };
  }
  // fallback: identifier
  const id = src.slice(i).match(/^([a-zA-Z_]\w*)/);
  if (id) {
    // detect function call syntax `name(...)`
    let operand: any = { ident: id[1] };

    // look ahead for parentheses (allow whitespace)
    let j = i + id[1].length;
    while (j < src.length && /[\s]/.test(src[j])) j++;
    if (src[j] === "(") {
      // find matching closing paren
      let depth = 0;
      let endIdx = -1;
      for (let k = j; k < src.length; k++) {
        const ch = src[k];
        if (ch === "(") depth++;
        else if (ch === ")") {
          depth--;
          if (depth === 0) {
            endIdx = k;
            break;
          }
        }
      }
      if (endIdx === -1) throw new Error("unbalanced parentheses in call");
      const inner = src.slice(j + 1, endIdx);
      // split by top-level commas
      const args: string[] = [];
      let cur = "";
      let d = 0;
      for (let k = 0; k < inner.length; k++) {
        const ch = inner[k];
        if (ch === '(' || ch === '{') d++;
        else if (ch === ')' || ch === '}') d = Math.max(0, d - 1);
        if (ch === ',' && d === 0) {
          args.push(cur.trim());
          cur = "";
        } else cur += ch;
      }
      if (cur.trim() !== "") args.push(cur.trim());
      operand.callArgs = args;
      operand = applyPrefixes(operand, prefixes);
      return { operand, len: i - pos + id[1].length + (endIdx - j + 1) };
    }

    operand = applyPrefixes(operand, prefixes);
    return { operand, len: i - pos + id[1].length };
  }
  return null;
}
