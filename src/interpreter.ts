export function interpret(input: string): number {
  const n = Number(input);
  if (!Number.isNaN(n)) return n;

  // Extract a leading numeric chunk using string parsing (avoid regex)
  let i = 0
  const len = input.length

  // optional sign
  if (input[i] === '+' || input[i] === '-') i++

  let seenDigit = false
  let seenDot = false

  while (i < len) {
    const ch = input[i]
    if (ch >= '0' && ch <= '9') {
      seenDigit = true
      i++
      continue
    }

    if (ch === '.' && !seenDot) {
      seenDot = true
      i++
      continue
    }

    break
  }

  if (!seenDigit) return NaN

  const numPart = input.slice(0, i)
  const rest = input.slice(i)

  // If there's a suffix (rest non-empty) and the number is negative, treat as error
  if (rest.length > 0 && numPart.startsWith('-')) {
    return NaN
  }

  return parseFloat(numPart)
}

