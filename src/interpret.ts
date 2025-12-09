function parseSuffix(suffix: string): { kind: "u" | "i"; bits: number } | null {
  const t = suffix.toLowerCase();
  if (!/^[ui](8|16|32|64)$/.test(t)) return null;
  const kind = t[0] as "u" | "i";
  const bits = Number(t.slice(1));
  return { kind, bits };
}

function checkRange(
  kind: "u" | "i",
  bits: number,
  value: bigint,
  suffix: string
) {
  if (isNaN(bits) || bits <= 0) return;
  if (kind === "u") {
    const max = (1n << BigInt(bits)) - 1n;
    if (value > max)
      throw new Error(`interpret: unsigned overflow for ${suffix}`);
  } else {
    const max = (1n << BigInt(bits - 1)) - 1n;
    const min = -(1n << BigInt(bits - 1));
    if (value > max || value < min)
      throw new Error(`interpret: signed overflow for ${suffix}`);
  }
}

// addSuffixed removed — multi-term addition handled inline

function parseParenthesizedValue(
  str: string
): { value: string; suffix: string; length: number } | null {
  if (!(str.startsWith('(') || str.startsWith('{'))) return null;
  const open = str[0];
  const close = open === '{' ? '}' : ')';
  let depth = 0;
  let i = 0;
  for (; i < str.length; i++) {
    const ch = str[i];
    if (ch === open) depth++;
    else if (ch === close) depth--;
    if (depth === 0) break;
  }
  if (i >= str.length) return null;
  const inner = str.slice(1, i);
  const sufMatches = Array.from(inner.matchAll(/[uUiI](?:8|16|32|64)/g)).map(
    (m) => m[0]
  );
  if (sufMatches.length === 0) return null;
  const sfx = sufMatches[0];
  if (!sufMatches.every((x) => x.toLowerCase() === sfx.toLowerCase()))
    return null;
  const val = interpret(inner);
  return { value: val, suffix: sfx, length: i + 1 };
}

function parseOperandToken(
  str: string
): { value: string; suffix: string; consumed: number } | null {
  // parenthesized value first
  const p = parseParenthesizedValue(str);
  if (p) return { value: p.value, suffix: p.suffix, consumed: p.length };

  const mm = str.match(/^\s*([+-]?\d+)\s*([a-zA-Z0-9]+)\s*/);
  if (!mm) return null;
  return { value: mm[1], suffix: mm[2], consumed: mm[0].length };
}

export function interpret(input: string): string {
  // Simple interpreter: accept integer strings and return them unchanged (trimmed).
  // Examples: "100" => "100"
  const s = input.trim();
  // Support numeric type suffixes like `100U8`, `-42u16`.
  // Capture the leading integer and ignore a trailing alphabetic/numeric suffix.
  // Require a suffix — bare integers (e.g. "100") are no longer supported.
  // Supported suffixes: U8, U16, U32, U64, I8, I16, I32, I64 (case-insensitive)
  const suffixRe = /^[uUiI](?:8|16|32|64)$/;

  // Try parse an n-ary expression of operands separated by + or -
  const tryParseExpr = (inputStr: string) => {
    // We attempt to tokenise and parse expressions (operands can be numbers
    // with suffixes or parenthesized sub-expressions). If parsing fails,
    // return null so the caller can handle single-value cases.

    // Tokenize operands and operators sequentially using helper
    const nums: string[] = [];
    const ops: string[] = [];
    let rest = inputStr;
    const firstTok = parseOperandToken(rest);
    if (!firstTok) return null;
    nums.push(firstTok.value);
    const firstSuffix = firstTok.suffix;
    rest = rest.slice(firstTok.consumed).trimStart();
    const opRe = /^([+\-*])\s*/;
    while (rest.length > 0) {
      const mo = rest.match(opRe);
      if (!mo) return null;
      ops.push(mo[1]);
      rest = rest.slice(mo[0].length);
      const tok = parseOperandToken(rest);
      if (!tok) return null;
      if (tok.suffix.toLowerCase() !== firstSuffix.toLowerCase()) return null;
      nums.push(tok.value);
      rest = rest.slice(tok.consumed).trimStart();
    }
    if (nums.length < 2) return null;
    return { nums, ops, suffix: firstSuffix } as {
      nums: string[];
      ops: string[];
      suffix: string;
    };
  };

  const exprParsed = tryParseExpr(s);
  if (exprParsed) {
    const { nums, ops, suffix } = exprParsed;
    const parsed = parseSuffix(suffix);
    if (!parsed)
      throw new Error(
        "interpret: mismatched or unsupported suffixes in expression"
      );
    const { kind, bits } = parsed;
    // Evaluate * before + and - (left-associative)
    // First, apply all multiplications
    let nnums: bigint[] = nums.map((x) => BigInt(x));
    let nops: string[] = [...ops];
    for (let i = 0; i < nops.length; ) {
      if (nops[i] === "*") {
        const prod = nnums[i] * nnums[i + 1];
        nnums.splice(i, 2, prod);
        nops.splice(i, 1);
      } else {
        i++;
      }
    }

    // Then evaluate + and - left-to-right
    let acc = nnums[0];
    for (let i = 0; i < nops.length; i++) {
      const op = nops[i];
      const n = nnums[i + 1];
      if (op === "+") acc = acc + n;
      else if (op === "-") acc = acc - n;
      else throw new Error("interpret: unsupported operator");
    }
    checkRange(kind, bits, acc, suffix);
    return acc.toString();
  }

  const m = s.match(/^([+-]?\d+)\s*([a-zA-Z0-9]+)$/);
  if (m) {
    const [, num, suffix] = m;
    // Ensure suffix is one of supported types
    if (!suffixRe.test(suffix)) {
      throw new Error("interpret: unsupported or invalid suffix");
    }

    const parsed = parseSuffix(suffix);
    if (!parsed) throw new Error("interpret: unsupported or invalid suffix");
    const { kind, bits } = parsed;
    checkRange(kind, bits, BigInt(num), suffix);

    return num;
  }
  throw new Error("interpret: only integer strings are supported");
}

export default interpret;
