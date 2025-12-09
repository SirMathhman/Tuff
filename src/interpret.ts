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

  // Addition expression with one or more '+' tokens between operands,
  // e.g. "1U8 + 2U8 + 3U8". Avoid treating unary + as an expression.
  const exprPattern =
    /^([+-]?\d+\s*[a-zA-Z0-9]+)(\s*\+\s*[+-]?\d+\s*[a-zA-Z0-9]+)+$/;
  if (exprPattern.test(s)) {
    const parts = s
      .split("+")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length < 2) throw new Error("interpret: invalid expression");

    const nums: string[] = [];
    const suffixes: string[] = [];
    for (const part of parts) {
      const mm = part.match(/^([+-]?\d+)\s*([a-zA-Z0-9]+)$/);
      if (!mm) throw new Error("interpret: invalid operand in expression");
      nums.push(mm[1]);
      suffixes.push(mm[2]);
    }

    // All suffixes must match and be supported
    const firstSuffix = suffixes[0];
    if (!suffixRe.test(firstSuffix))
      throw new Error(
        "interpret: mismatched or unsupported suffixes in expression"
      );
    if (
      !suffixes.every((suf) => suf.toLowerCase() === firstSuffix.toLowerCase())
    )
      throw new Error(
        "interpret: mismatched or unsupported suffixes in expression"
      );

    const parsed = parseSuffix(firstSuffix);
    if (!parsed)
      throw new Error(
        "interpret: mismatched or unsupported suffixes in expression"
      );
    const { kind, bits } = parsed;

    let sum = 0n;
    for (const n of nums) sum += BigInt(n);
    checkRange(kind, bits, sum, firstSuffix);
    return sum.toString();
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
