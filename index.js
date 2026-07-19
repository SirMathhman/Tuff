export function evaluate(source, scope) {
  if (source.trim() === "") return 0;

  const tokens = source.trim().replace(/([()+*\/\-{};=])/g, " $1 ").trim().split(/\s+/);
  let i = 0;
  const vars = scope || {};

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
    const token = tokens[i];
    if (token === "(") {
      i++;
      const value = parseExpr();
      if (tokens[i] !== ")") {
        throw new Error("Missing closing parenthesis");
      }
      i++;
      return value;
    }
    if (token === "{") {
      i++;
      let lastValue = 0;
      while (i < tokens.length && tokens[i] !== "}") {
        if (tokens[i] === "let") {
          i++; // skip "let"
          const name = tokens[i++];
          if (tokens[i] !== "=") {
            throw new Error("Expected '=' after variable name");
          }
          i++; // skip "="
          vars[name] = parseExpr();
          if (tokens[i] === ";") i++; // skip ";"
        } else {
          lastValue = parseExpr();
          if (tokens[i] === ";") i++; // skip ";"
        }
      }
      if (tokens[i] !== "}") {
        throw new Error("Missing closing brace");
      }
      i++;
      return lastValue;
    }
    if (token && /^[a-zA-Z_]\w*$/.test(token) && token in vars) {
      i++;
      return vars[token];
    }
    i++;
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