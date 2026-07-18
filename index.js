const VALID_SUFFIXES = new Set(["U8", "U16", "U32", "I8", "I16", "I32", "F32", "F64"]);

export function compile(source) {
  const tokens = tokenize(source);
  const statements = parse(tokens);
  return generate(statements);
}

function tokenize(source) {
  const tokens = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    if (ch === ";") {
      tokens.push({ type: "SEMICOLON" });
      i++;
      continue;
    }
    if (ch === "-") {
      tokens.push({ type: "MINUS" });
      i++;
      continue;
    }
    if (ch >= "0" && ch <= "9") {
      let numStr = "";
      while (i < source.length && ((source[i] >= "0" && source[i] <= "9") || source[i] === ".")) {
        numStr += source[i];
        i++;
      }
      let suffix = "";
      if (i < source.length && "UIF".includes(source[i])) {
        while (i < source.length && ((source[i] >= "A" && source[i] <= "Z") || (source[i] >= "0" && source[i] <= "9"))) {
          suffix += source[i];
          i++;
        }
      }
      if (suffix && !VALID_SUFFIXES.has(suffix)) {
        throw new Error(`Invalid suffix: ${suffix}`);
      }
      tokens.push({ type: "NUMBER", value: numStr, suffix });
      continue;
    }
    throw new Error(`Unexpected character: ${ch}`);
  }
  tokens.push({ type: "EOF" });
  return tokens;
}

function parse(tokens) {
  const statements = [];
  let i = 0;
  while (tokens[i].type !== "EOF") {
    let negative = false;
    if (tokens[i].type === "MINUS") {
      negative = true;
      i++;
    }
    if (tokens[i].type !== "NUMBER") {
      throw new Error(`Expected number, got ${tokens[i].type}`);
    }
    const numToken = tokens[i];
    i++;
    statements.push({ negative, value: numToken.value, suffix: numToken.suffix });
    if (tokens[i].type === "SEMICOLON") {
      i++;
    }
  }
  return statements;
}

function clampExpr(value, suffix) {
  switch (suffix) {
    case "U8":
      return `Math.max(0, Math.min(255, ${value}))`;
    case "U16":
      return `Math.max(0, Math.min(65535, ${value}))`;
    case "U32":
      return `Math.max(0, Math.min(4294967295, ${value}))`;
    case "I8":
      return `Math.max(-128, Math.min(127, ${value}))`;
    case "I16":
      return `Math.max(-32768, Math.min(32767, ${value}))`;
    case "I32":
      return `Math.max(-2147483648, Math.min(2147483647, ${value}))`;
    case "F32":
      return `parseFloat(${value}.toPrecision(6))`;
    case "F64":
      return value;
    case "":
      return value;
    default:
      throw new Error(`Unknown suffix: ${suffix}`);
  }
}

function generate(statements) {
  if (statements.length === 0) return "return 0;";
  let code = "";
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    let value = stmt.negative ? `-${stmt.value}` : stmt.value;
    value = clampExpr(value, stmt.suffix);
    if (i === statements.length - 1) {
      code += `return ${value};`;
    } else {
      code += `${value};`;
    }
  }
  return code;
}
