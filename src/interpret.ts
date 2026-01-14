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
  if (big < range.min || big > range.max)
    throw new Error(`${key} out of range`);

  if (
    bits === 64 &&
    (big > BigInt(Number.MAX_SAFE_INTEGER) ||
      big < BigInt(Number.MIN_SAFE_INTEGER))
  ) {
    throw new Error(`${key} value not representable as a JavaScript number`);
  }

  return { value: Number(intVal), type: key };
}

function promoteTypes(type1?: string, type2?: string): string | undefined {
  if (!type1) return type2;
  if (!type2) return type1;
  const r1 = RANGES[type1];
  const r2 = RANGES[type2];
  return r1.max >= r2.max ? type1 : type2;
}

function checkOverflow(value: number, type?: string): void {
  if (type) {
    const r = RANGES[type];
    const big = BigInt(Math.floor(value));
    if (big < r.min || big > r.max) throw new Error(`${type} overflow`);
  }
}

function evaluateExpression(
  s: string,
  tokens: Array<{ text: string; index: number }>
): number {
  const parsed = tokens.map((t) => ({
    ...parseToken(t.text),
    text: t.text,
    index: t.index,
  }));

  const ops: string[] = [];
  for (let i = 1; i < parsed.length; i++) {
    const between = s.slice(
      parsed[i - 1].index + parsed[i - 1].text.length,
      parsed[i].index
    );
    const opMatch = between.match(/[+\-*/]/);
    if (!opMatch) throw new Error("Invalid operator between operands");
    ops.push(opMatch[0]);
  }

  const values = parsed.map((p) => ({ value: p.value, type: p.type }));
  const currentOps = [...ops];

  for (let i = 0; i < currentOps.length; i++) {
    if (currentOps[i] === "*" || currentOps[i] === "/") {
      const left = values[i];
      const right = values[i + 1];
      const result =
        currentOps[i] === "*"
          ? left.value * right.value
          : left.value / right.value;
      const type = promoteTypes(left.type, right.type);
      checkOverflow(result, type);
      values.splice(i, 2, { value: result, type });
      currentOps.splice(i, 1);
      i--;
    }
  }

  let total = values[0].value;
  let totalType = values[0].type;
  for (let i = 0; i < currentOps.length; i++) {
    const next = values[i + 1];
    const result =
      currentOps[i] === "+" ? total + next.value : total - next.value;
    const type = promoteTypes(totalType, next.type);
    checkOverflow(result, type);
    total = result;
    totalType = type;
  }
  return total;
}

export function interpret(input: string): number {
  const s = input.trim();
  const tokenRegex =
    /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?(?:[uUiI](?:8|16|32|64))?/g;
  const tokens: Array<{ text: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = tokenRegex.exec(s))) tokens.push({ text: m[0], index: m.index });

  if (tokens.length === 0) throw new Error("Invalid number");
  if (tokens.length === 1) return parseToken(tokens[0].text).value;
  return evaluateExpression(s, tokens);
}
