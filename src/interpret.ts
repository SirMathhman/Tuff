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

function addSuffixed(
  n1: string,
  suf1: string,
  n2: string,
  suf2: string
): string {
  if (suf1.toLowerCase() !== suf2.toLowerCase())
    throw new Error(
      "interpret: mismatched or unsupported suffixes in expression"
    );
  const suffix = suf1;
  const parsed = parseSuffix(suffix);
  if (!parsed)
    throw new Error(
      "interpret: mismatched or unsupported suffixes in expression"
    );
  const { kind, bits } = parsed;
  const sum = BigInt(n1) + BigInt(n2);
  checkRange(kind, bits, sum, suffix);
  return sum.toString();
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

  // Binary addition like: "100U8 + 50U8"
  const exprMatch = s.match(
    /^([+-]?\d+)\s*([a-zA-Z0-9]+)\s*\+\s*([+-]?\d+)\s*([a-zA-Z0-9]+)$/
  );
  if (exprMatch) {
    const [, n1, suf1, n2, suf2] = exprMatch;
    return addSuffixed(n1, suf1, n2, suf2);
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
