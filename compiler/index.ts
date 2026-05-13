export function interpretTuff(input: string): number {
  const match = input.match(/^(\d+)/);
  if (!match) return 0;
  return parseInt(match[1]!, 10);
}


