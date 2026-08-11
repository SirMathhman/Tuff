export function evaluate(source: string): number {
  if (source === "") return 0;

  // Split on + and -, keeping the operator
  const tokens = source.split(/([+-])/);
  if (tokens.length === 1) {
    const num = Number(tokens[0]!);
    if (tokens[0]!.trim() === String(num)) return num;
    throw new Error("Invalid source: " + source);
  }

  let result = Number(tokens[0]!.trim());
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i]!;
    const val = Number(tokens[i + 1]!.trim());
    if (op === "+") result += val;
    else if (op === "-") result -= val;
  }
  return result;
}
