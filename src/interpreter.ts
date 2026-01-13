export function interpret(input: string): number {
  const n = Number(input)
  if (!Number.isNaN(n)) return n
  return parseFloat(input)
}
