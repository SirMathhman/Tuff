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
    const exprPattern =
      /^([+-]?\d+\s*[a-zA-Z0-9]+)(?:\s*[-+]\s*[+-]?\d+\s*[a-zA-Z0-9]+)+$/;
    if (!exprPattern.test(inputStr)) return null as null | { nums: string[]; ops: string[]; suffix: string };

    // Tokenize operands and operators sequentially
    const nums: string[] = [];
    const ops: string[] = [];
    let rest = inputStr;
    const firstRe = /^\s*([+-]?\d+)\s*([a-zA-Z0-9]+)\s*/;
    const m0 = rest.match(firstRe);
    if (!m0) return null;
    nums.push(m0[1]);
    const firstSuffix = m0[2];
    rest = rest.slice(m0[0].length);
    const opRe = /^([+-])\s*/;
    const operandRe = /^([+-]?\d+)\s*([a-zA-Z0-9]+)\s*/;
    while (rest.length > 0) {
      const mo = rest.match(opRe);
      if (!mo) return null;
      ops.push(mo[1]);
      rest = rest.slice(mo[0].length);
      const mm = rest.match(operandRe);
      if (!mm) return null;
      nums.push(mm[1]);
      if (mm[2].toLowerCase() !== firstSuffix.toLowerCase()) return null;
      rest = rest.slice(mm[0].length);
    }
    return { nums, ops, suffix: firstSuffix } as { nums: string[]; ops: string[]; suffix: string };
  };

  const exprParsed = tryParseExpr(s);
  if (exprParsed) {
    const { nums, ops, suffix } = exprParsed;
    const parsed = parseSuffix(suffix);
    if (!parsed) throw new Error('interpret: mismatched or unsupported suffixes in expression');
    const { kind, bits } = parsed;
    let acc = BigInt(nums[0]);
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      const n = BigInt(nums[i + 1]);
      acc = op === '+' ? acc + n : acc - n;
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
