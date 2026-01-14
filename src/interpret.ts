const RANGES: Record<string, { min: bigint; max: bigint }> = {
  U8: { min: 0n, max: 255n },
  U16: { min: 0n, max: 65535n },
  U32: { min: 0n, max: 4294967295n },
  U64: { min: 0n, max: 18446744073709551615n },
  I8: { min: -128n, max: 127n },
  I16: { min: -32768n, max: 32767n },
  I32: { min: -2147483648n, max: 2147483647n },
  I64: { min: -9223372036854775808n, max: 9223372036854775807n },
};

function parseToken(token: string): { value: number; type?: string } {
  const m = token.match(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
  if (!m) throw new Error("Invalid number");
  const numStr = m[0];
  const n = parseFloat(numStr);
  if (Number.isNaN(n)) throw new Error("Invalid number");

  const rest = token.slice(numStr.length);
  if (rest.length === 0) return { value: n };

  const sufMatch = rest.match(/^([uUiI])(8|16|32|64)(.*)$/);
  if (!sufMatch) return { value: n };

  const sign = sufMatch[1].toUpperCase();
  const bits = parseInt(sufMatch[2], 10);

  if (!/^[-+]?\d+$/.test(numStr)) {
    throw new Error("Integer required for integer type suffix");
  }

  const intVal = Number(numStr);

  const key = `${sign}${bits}`;
  const range = RANGES[key];
  if (!range) return { value: n };

  const big = BigInt(intVal);
  if (big < range.min || big > range.max) throw new Error(`${key} out of range`);

  if (
    bits === 64 &&
    (big > BigInt(Number.MAX_SAFE_INTEGER) || big < BigInt(Number.MIN_SAFE_INTEGER))
  ) {
    throw new Error(`${key} value not representable as a JavaScript number`);
  }

  return { value: Number(intVal), type: key };
}

function evaluateExpression(s: string, tokens: Array<{ text: string; index: number }>): number {
  const parsed = tokens.map((t) => ({ ...parseToken(t.text), text: t.text, index: t.index }));
  if (parsed.length === 1) return parsed[0].value;

  let total = parsed[0].value;
  let totalType = parsed[0].type;

  for (let i = 1; i < parsed.length; i++) {
    const prev = parsed[i - 1];
    const cur = parsed[i];
    const between = s.slice(prev.index + prev.text.length, cur.index);
    const opMatch = between.match(/[+-]/);
    if (!opMatch) throw new Error("Invalid operator between operands");
    const op = opMatch[0];

    const val = cur.value;
    const nextType = cur.type;

    const result = op === "+" ? total + val : total - val;

    if (totalType && nextType && totalType === nextType) {
      const range = RANGES[totalType!];
      if (range) {
        const bigRes = BigInt(result);
        if (bigRes < range.min || bigRes > range.max) {
          throw new Error(`${totalType} overflow`);
        }
      }
    }

    total = result;
    totalType = totalType && nextType && totalType === nextType ? totalType : undefined;
  }

  return total;
}

export function interpret(input: string): number {
  const s = input.trim();
  const tokenRegex = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?(?:[uUiI](?:8|16|32|64))?/g;
  const tokens: Array<{ text: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = tokenRegex.exec(s))) tokens.push({ text: m[0], index: m.index });

  if (tokens.length === 0) throw new Error("Invalid number");
  if (tokens.length === 1) return parseToken(tokens[0].text).value;
  return evaluateExpression(s, tokens);
}
