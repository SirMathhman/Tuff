export function interpret(input: string): string {
  // Simple interpreter: accept integer strings and return them unchanged (trimmed).
  // Examples: "100" => "100"
  const s = input.trim();
    // Support numeric type suffixes like `100U8`, `-42u16`.
    // Capture the leading integer and ignore a trailing alphabetic/numeric suffix.
    const m = s.match(/^([+-]?\d+)(?:[a-zA-Z0-9]+)?$/)
    if (m) return m[1];
  throw new Error("interpret: only integer strings are supported");
}

export default interpret;
