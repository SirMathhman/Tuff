export type Token =
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean }
  | { type: "identifier"; name: string }
  | { type: "plus" }
  | { type: "minus" }
  | { type: "star" }
  | { type: "slash" }
  | { type: "equals" }
  | { type: "plusEquals" }
  | { type: "minusEquals" }
  | { type: "starEquals" }
  | { type: "slashEquals" }
  | { type: "orEquals" }
  | { type: "andEquals" }
  | { type: "equalsEquals" }
  | { type: "notEquals" }
  | { type: "lessThan" }
  | { type: "lessThanOrEqual" }
  | { type: "greaterThan" }
  | { type: "greaterThanOrEqual" }
  | { type: "semicolon" }
  | { type: "or" }
  | { type: "and" }
  | { type: "not" }
  | { type: "if" }
  | { type: "else" }
  | { type: "while" }
  | { type: "break" }
  | { type: "continue" }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "lbrace" }
  | { type: "rbrace" };

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const char = source.charAt(i);
    if (/\s/.test(char)) {
      i++;
      continue;
    }
    if (/\d/.test(char)) {
      let value = "";
      while (i < source.length && /\d/.test(source.charAt(i))) {
        value += source.charAt(i++);
      }
      tokens.push({ type: "number", value: Number(value) });
      continue;
    }
    if (/[a-zA-Z_]/.test(char)) {
      let name = "";
      while (i < source.length && /[a-zA-Z0-9_]/.test(source.charAt(i))) {
        name += source.charAt(i++);
      }
      if (name === "true" || name === "false") {
        tokens.push({ type: "boolean", value: name === "true" });
      } else if (name === "if") {
        tokens.push({ type: "if" });
      } else if (name === "else") {
        tokens.push({ type: "else" });
      } else if (name === "while") {
        tokens.push({ type: "while" });
      } else if (name === "break") {
        tokens.push({ type: "break" });
      } else if (name === "continue") {
        tokens.push({ type: "continue" });
      } else {
        tokens.push({ type: "identifier", name });
      }
      continue;
    }
    switch (char) {
      case "+":
        if (source.charAt(i + 1) === "=") {
          tokens.push({ type: "plusEquals" });
          i++;
        } else {
          tokens.push({ type: "plus" });
        }
        break;
      case "-":
        if (source.charAt(i + 1) === "=") {
          tokens.push({ type: "minusEquals" });
          i++;
        } else {
          tokens.push({ type: "minus" });
        }
        break;
      case "*":
        if (source.charAt(i + 1) === "=") {
          tokens.push({ type: "starEquals" });
          i++;
        } else {
          tokens.push({ type: "star" });
        }
        break;
      case "/":
        if (source.charAt(i + 1) === "=") {
          tokens.push({ type: "slashEquals" });
          i++;
        } else {
          tokens.push({ type: "slash" });
        }
        break;
      case "=":
        if (source.charAt(i + 1) === "=") {
          tokens.push({ type: "equalsEquals" });
          i++;
        } else {
          tokens.push({ type: "equals" });
        }
        break;
      case ";":
        tokens.push({ type: "semicolon" });
        break;
      case "|":
        if (source.charAt(i + 1) === "|") {
          if (source.charAt(i + 2) === "=") {
            tokens.push({ type: "orEquals" });
            i += 2;
          } else {
            tokens.push({ type: "or" });
            i++;
          }
        } else {
          throw new Error(`Unexpected character: ${char}`);
        }
        break;
      case "&":
        if (source.charAt(i + 1) === "&") {
          if (source.charAt(i + 2) === "=") {
            tokens.push({ type: "andEquals" });
            i += 2;
          } else {
            tokens.push({ type: "and" });
            i++;
          }
        } else {
          throw new Error(`Unexpected character: ${char}`);
        }
        break;
      case "!":
        if (source.charAt(i + 1) === "=") {
          tokens.push({ type: "notEquals" });
          i++;
        } else {
          tokens.push({ type: "not" });
        }
        break;
      case "<":
        if (source.charAt(i + 1) === "=") {
          tokens.push({ type: "lessThanOrEqual" });
          i++;
        } else {
          tokens.push({ type: "lessThan" });
        }
        break;
      case ">":
        if (source.charAt(i + 1) === "=") {
          tokens.push({ type: "greaterThanOrEqual" });
          i++;
        } else {
          tokens.push({ type: "greaterThan" });
        }
        break;
      case "(":
        tokens.push({ type: "lparen" });
        break;
      case ")":
        tokens.push({ type: "rparen" });
        break;
      case "{":
        tokens.push({ type: "lbrace" });
        break;
      case "}":
        tokens.push({ type: "rbrace" });
        break;
      default:
        throw new Error(`Unexpected character: ${char}`);
    }
    i++;
  }
  return tokens;
}
