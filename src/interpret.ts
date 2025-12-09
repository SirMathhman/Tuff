export function interpret(input: string): string {
  // Simple interpreter: accept integer strings and return them unchanged (trimmed).
  // Examples: "100" => "100"
  const s = input.trim()
  if (/^[+-]?\d+$/.test(s)) return s
  throw new Error('interpret: only integer strings are supported')
}

export default interpret
