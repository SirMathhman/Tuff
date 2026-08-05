export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (trimmed === "") return 0;
  const tokens = trimmed.split(/([+\-*/()])/).filter((t) => t.trim() !== "");
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
    let result: number;
    if (tokens[pos] === "(") {
      pos++;
      result = parseExpression();
      pos++; // skip ")"
    } else {
      result = parseFloat(tokens[pos]!);
      pos++;
    }
    while (tokens[pos] === "*" || tokens[pos] === "/") {
      const op = tokens[pos]!;
      pos++;
      const next = parseFactor();
      if (op === "*") result *= next;
      else result /= next;
    }
    return result;
  }
  function parseFactor(): number {
    if (tokens[pos] === "(") {
      pos++;
      const result = parseExpression();
      pos++; // skip ")"
      return result;
    }
    const result = parseFloat(tokens[pos]!);
    pos++;
    return result;
  }
  return parseExpression();
}
