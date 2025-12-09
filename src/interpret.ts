export function interpret(input: string): string {
  // Simple interpreter: accept integer strings and return them unchanged (trimmed).
  // Examples: "100" => "100"
  const s = input.trim();
  // Support numeric type suffixes like `100U8`, `-42u16`.
  // Capture the leading integer and ignore a trailing alphabetic/numeric suffix.
  // Require a suffix — bare integers (e.g. "100") are no longer supported.
  // Supported suffixes: U8, U16, U32, U64, I8, I16, I32, I64 (case-insensitive)
  const suffixRe = /^[uUiI](?:8|16|32|64)$/

  // Binary addition like: "100U8 + 50U8"
  const exprMatch = s.match(
    /^([+-]?\d+)\s*([a-zA-Z0-9]+)\s*\+\s*([+-]?\d+)\s*([a-zA-Z0-9]+)$/
  );
  if (exprMatch) {
    const [, n1, suf1, n2, suf2] = exprMatch;
    // Require same suffix for simplicity and ensure it's supported
    if (suf1.toLowerCase() !== suf2.toLowerCase() || !suffixRe.test(suf1)) {
      throw new Error("interpret: mismatched or unsupported suffixes in expression");
    }

    const sum = BigInt(n1) + BigInt(n2);

    // Validate range according to suffix type
    const t = suf1.toLowerCase()
    const kind = t[0] // 'u' or 'i'
    const bits = Number(t.slice(1))
    if (!Number.isNaN(bits) && bits > 0) {
      if (kind === 'u') {
        const max = (1n << BigInt(bits)) - 1n
        if (sum > max) throw new Error(`interpret: unsigned overflow for ${suf1}`)
      } else {
        const max = (1n << BigInt(bits - 1)) - 1n
        const min = -(1n << BigInt(bits - 1))
        if (sum > max || sum < min) throw new Error(`interpret: signed overflow for ${suf1}`)
      }
    }

    return sum.toString();
  }

  const m = s.match(/^([+-]?\d+)\s*([a-zA-Z0-9]+)$/);
  if (m) {
    const [, num, suffix] = m;
    // Ensure suffix is one of supported types
    if (!suffixRe.test(suffix)) {
      throw new Error('interpret: unsupported or invalid suffix')
    }

    const t = suffix.toLowerCase()
    const kind = t[0]
    const bits = Number(t.slice(1))
    if (!Number.isNaN(bits) && bits > 0) {
      const value = BigInt(num)
      if (kind === 'u') {
        const max = (1n << BigInt(bits)) - 1n
        if (value > max) throw new Error(`interpret: unsigned overflow for ${suffix}`)
        // negative values are allowed for unsigned types (preserve prior behaviour)
      } else {
        const max = (1n << BigInt(bits - 1)) - 1n
        const min = -(1n << BigInt(bits - 1))
        if (value > max || value < min) throw new Error(`interpret: signed overflow for ${suffix}`)
      }
    }

    return num;
  }
  throw new Error("interpret: only integer strings are supported");
}

export default interpret;
