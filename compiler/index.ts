export function interpretTuff(input: string): number {
  if (input === "") return 0;

  const match = input.match(/^(\d+)/);
  if (!match) throw new Error(`Invalid Tuff value: ${input}`);

  return parseInt(match[1]!, 10);
}

