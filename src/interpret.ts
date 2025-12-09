export function interpret(input: string): string {
  // Simple interpreter: accept integer strings and return them unchanged (trimmed).
  // Examples: "100" => "100"
  const s = input.trim();
  // Support numeric type suffixes like `100U8`, `-42u16`.
  // Capture the leading integer and ignore a trailing alphabetic/numeric suffix.
  // Require a suffix — bare integers (e.g. "100") are no longer supported.
  const m = s.match(/^([+-]?\d+)([a-zA-Z0-9]+)$/);
  if (m) {
    const [, num, suffix] = m;
    // If suffix indicates unsigned (starts with 'u' or 'U'), negative values are invalid
    // and the numeric value must fit in the declared bit width (U8 -> 8 bits -> 0..255).
    if (suffix && /^[uU]/.test(suffix)) {
      if (/^-/.test(num)) {
        throw new Error('interpret: negative value not allowed for unsigned type')
      }

      const unsignedMatch = suffix.match(/^[uU](\d+)$/)
      if (unsignedMatch) {
        const bits = Number(unsignedMatch[1])
        if (!Number.isNaN(bits) && bits > 0) {
          const value = BigInt(num)
          const max = (1n << BigInt(bits)) - 1n
          if (value > max) {
            throw new Error(`interpret: unsigned overflow for ${suffix}`)
          }
        }
      }
    }

    return num;
  }
  throw new Error("interpret: only integer strings are supported");
}

export default interpret;
