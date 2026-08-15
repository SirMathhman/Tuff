export function interpret(input: string): number {
  const n = Number(input);
  if (Number.isNaN(n)) {
    throw new Error(`interpret: invalid number "${input}"`);
  }
  return n;
}
