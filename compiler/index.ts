export function interpretTuff(input: string): number {
  if (input === "") return 0;

  const match = input.match(/^(\d+)(U\d+)/);
  if (!match) throw new Error(`Invalid Tuff value: ${input}`);

  const value = parseInt(match[1]!, 10);
  const typeSuffix = match[2]!;

  let maxVal: number;
  switch (typeSuffix) {
    case "U8":
      maxVal = 255;
      break;
    default:
      throw new Error(`Unsupported Tuff type: ${typeSuffix}`);
  }

  if (value > maxVal) {
    throw new Error(
      `Value ${value} exceeds maximum for ${typeSuffix}: ${maxVal}`,
    );
  }

  return value;
}
