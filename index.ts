export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (trimmed === "") return 0;

  const tokens = trimmed.match(/\d+|[+\-*/()]/g);
  if (!tokens || tokens.length === 0) return 0;
  const t = tokens;

  let pos = 0;

  function parseExpression(): number {
    let result = parseTerm();
    while (pos < t.length && (t[pos] === "+" || t[pos] === "-")) {
      const op = t[pos++];
      const val = parseTerm();
      result = op === "+" ? result + val : result - val;
    }
    return result;
  }

  function parseTerm(): number {
    let result = parseFactor();
    while (pos < t.length && (t[pos] === "*" || t[pos] === "/")) {
      const op = t[pos++];
      const val = parseFactor();
      result = op === "*" ? result * val : result / val;
    }
    return result;
  }

  function parseFactor(): number {
    if (t[pos] === "(") {
      pos++; // consume "("
      const result = parseExpression();
      pos++; // consume ")"
      return result;
    }
    return Number(t[pos++]);
  }

  return parseExpression();
}
