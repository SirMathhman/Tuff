export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (trimmed === '') return 0;

  // Tokenize into numbers and operators
  const tokens = trimmed.match(/(\d+|[+\-])/g);
  if (!tokens) return 0;

  let result = Number(tokens[0]);
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const next = Number(tokens[i + 1]);
    if (op === '+') result += next;
    else if (op === '-') result -= next;
  }
  return result;
}
