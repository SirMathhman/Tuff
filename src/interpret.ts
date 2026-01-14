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

type TypedVal = { value: number; type?: string };
type Scope = Record<string, TypedVal>;

function parseToken(token: string, scope: Scope = {}): TypedVal {
  if (scope[token]) return scope[token];
  const m = token.match(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
  if (!m) throw new Error(`Invalid token: ${token}`);
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
  tokens: Array<{ text: string; index: number }>,
  scope: Scope = {}
): TypedVal {
  const parsed = tokens.map((t) => ({
    ...parseToken(t.text, scope),
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
  return { value: total, type: totalType };
}

function interpretRaw(input: string, scope: Scope = {}): TypedVal {
  let s = input.trim();
  while (s.includes("(") || s.includes("{")) {
    const lastOpenParen = s.lastIndexOf("(");
    const lastOpenCurly = s.lastIndexOf("{");
    const isCurly = lastOpenCurly > lastOpenParen;
    const lastOpen = isCurly ? lastOpenCurly : lastOpenParen;
    const closeChar = isCurly ? "}" : ")";
    const nextClose = s.indexOf(closeChar, lastOpen);
    if (nextClose === -1)
      throw new Error(
        `Missing closing ${isCurly ? "curly brace" : "parenthesis"}`
      );
    const internal = s.slice(lastOpen + 1, nextClose);
    const result = interpretRaw(internal, isCurly ? { ...scope } : scope);
    s = s.slice(0, lastOpen) + result.value + (result.type ?? "") + s.slice(nextClose + 1);
  }

  const statements = s
    .split(";")
    .map((st) => st.trim())
    .filter((st) => st.length > 0);
  let lastVal: TypedVal = { value: 0 };
  for (const st of statements) {
    const letMatch = st.match(
      /^let\s+([a-zA-Z_]\w*)\s*(?::\s*([uUiI](?:8|16|32|64)))?\s*=\s*(.+)$/
    );
    if (letMatch) {
      const [, name, type, expr] = letMatch;
      const res = interpretRaw(expr, scope);
      const finalType = type || res.type;
      if (finalType) checkOverflow(res.value, finalType);
      scope[name] = { value: res.value, type: finalType };
      lastVal = res;
    } else {
      const tokenRegex =
        /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?(?:[uUiI](?:8|16|32|64))?|[a-zA-Z_]\w*/g;
      const tokens: Array<{ text: string; index: number }> = [];
      let m: RegExpExecArray | null;
      while ((m = tokenRegex.exec(st)))
        tokens.push({ text: m[0], index: m.index });
      if (tokens.length === 0) throw new Error("Invalid statement");
      lastVal =
        tokens.length === 1
          ? parseToken(tokens[0].text, scope)
          : evaluateExpression(st, tokens, scope);
    }
  }
  return lastVal;
}

export function interpret(input: string, scope: Scope = {}): number {
  return interpretRaw(input, scope).value;
}
