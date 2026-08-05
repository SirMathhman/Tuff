export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (trimmed === "") return 0;
  const tokens = trimmed.split(/([+\-])/);
  let result = parseFloat(tokens[0]!);
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const next = parseFloat(tokens[i + 1]!);
    if (op === "+") result += next;
    else if (op === "-") result -= next;
  }
  return result;
}
