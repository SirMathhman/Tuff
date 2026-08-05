export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (trimmed === "") return 0;
  const tokens = trimmed.split(/([+\-*/])/);
  let pos = 0;
  function parseExpression(): number {
    let result = parseTerm();
    while (tokens[pos] === "+" || tokens[pos] === "-") {
      const op = tokens[pos]!;
      pos++;
      const next = parseTerm();
      if (op === "+") result += next;
      else result -= next;
    }
    return result;
  }
  function parseTerm(): number {
    let result = parseFloat(tokens[pos]!);
    pos++;
    while (tokens[pos] === "*" || tokens[pos] === "/") {
      const op = tokens[pos]!;
      pos++;
      const next = parseFloat(tokens[pos]!);
      pos++;
      if (op === "*") result *= next;
      else result /= next;
    }
    return result;
  }
  return parseExpression();
}
