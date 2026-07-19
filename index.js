export function evaluate(source) {
  if (source.trim() === "") return 0;

  const tokens = source.trim().replace(/([()+*/\-{}])/g, " $1 ").trim().split(/\s+/);
  let i = 0;

  function parseExpr() {
    let left = parseTerm();
    while (i < tokens.length && (tokens[i] === "+" || tokens[i] === "-")) {
      const op = tokens[i++];
      left = op === "+" ? left + parseTerm() : left - parseTerm();
    }
    return left;
  }

  function parseTerm() {
    let left = parseFactor();
    while (i < tokens.length && (tokens[i] === "*" || tokens[i] === "/")) {
      const op = tokens[i++];
      left = op === "*" ? left * parseFactor() : left / parseFactor();
    }
    return left;
  }

  function parseFactor() {
    const opener = tokens[i];
    if (opener === "(" || opener === "{") {
      i++;
      const value = parseExpr();
      const closing = opener === "(" ? ")" : "}";
      if (tokens[i] !== closing) {
        throw new Error(`Missing closing ${closing}`);
      }
      i++; // skip closing bracket
      return value;
    }
    const token = tokens[i++];
    const value = Number(token);
    if (isNaN(value)) {
      throw new Error(`Unexpected token: ${token}`);
    }
    return value;
  }

  const result = parseExpr();
  if (i < tokens.length) {
    throw new Error(`Unexpected token: ${tokens[i]}`);
  }
  return result;
}