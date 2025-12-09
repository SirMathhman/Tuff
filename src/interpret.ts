export function interpret(input: string): string {
  // Simple interpreter: accept integer strings and return them unchanged (trimmed).
  // Examples: "100" => "100"
  const s = input.trim();
  // Support numeric type suffixes like `100U8`, `-42u16`.
  // Capture the leading integer and ignore a trailing alphabetic/numeric suffix.
  // Require a suffix — bare integers (e.g. "100") are no longer supported.
  // Binary addition like: "100U8 + 50U8"
  const exprMatch = s.match(/^([+-]?\d+)([a-zA-Z0-9]+)\s*\+\s*([+-]?\d+)([a-zA-Z0-9]+)$/)
  if (exprMatch) {
    const [, n1, suf1, n2, suf2] = exprMatch
    // Require same suffix for simplicity
    if (suf1.toLowerCase() !== suf2.toLowerCase()) {
      throw new Error('interpret: mismatched suffixes in expression')
    }

    const sum = BigInt(n1) + BigInt(n2)

    // If unsigned suffix, enforce overflow on positive values
    if (/^[uU]/.test(suf1)) {
      const unsignedMatch = suf1.match(/^[uU](\d+)$/)
      if (unsignedMatch) {
        const bits = Number(unsignedMatch[1])
        if (!Number.isNaN(bits) && bits > 0) {
          const max = (1n << BigInt(bits)) - 1n
          if (sum > max) throw new Error(`interpret: unsigned overflow for ${suf1}`)
        }
      }
    }

    return sum.toString()
  }

  const m = s.match(/^([+-]?\d+)([a-zA-Z0-9]+)$/);
  if (m) {
    const [, num, suffix] = m;
    // If suffix indicates unsigned (starts with 'u' or 'U'), negative values are invalid
    // and the numeric value must fit in the declared bit width (U8 -> 8 bits -> 0..255).
    if (suffix && /^[uU]/.test(suffix)) {
      // Negative values are allowed even with unsigned suffixes (e.g. -1U8)

      const unsignedMatch = suffix.match(/^[uU](\d+)$/);
      if (unsignedMatch) {
        const bits = Number(unsignedMatch[1]);
        if (!Number.isNaN(bits) && bits > 0) {
          const value = BigInt(num);
          const max = (1n << BigInt(bits)) - 1n;
          if (value > max) {
            throw new Error(`interpret: unsigned overflow for ${suffix}`);
          }
        }
      }
    }

    return num;
  }
  throw new Error("interpret: only integer strings are supported");
}

export default interpret;
