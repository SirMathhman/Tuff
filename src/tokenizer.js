import { parseNumberLiteral } from "./types.js";

export function tokenize(source) {
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
    if (ch === "(") {
      tokens.push({ type: "LPAREN" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "RPAREN" });
      i++;
      continue;
    }
    if (ch === "{") {
      tokens.push({ type: "LBRACE" });
      i++;
      continue;
    }
    if (ch === "}") {
      tokens.push({ type: "RBRACE" });
      i++;
      continue;
    }
    if (ch === "[") {
      tokens.push({ type: "LBRACKET" });
      i++;
      continue;
    }
    if (ch === "]") {
      tokens.push({ type: "RBRACKET" });
      i++;
      continue;
    }
    if (ch === "+" && i + 1 < source.length && source[i + 1] === "=") {
      tokens.push({ type: "COMPOUND", value: "+=" });
      i += 2;
      continue;
    }
    if (ch === "*" && i + 1 < source.length && source[i + 1] === "=") {
      tokens.push({ type: "COMPOUND", value: "*=" });
      i += 2;
      continue;
    }
    if (ch === "/" && i + 1 < source.length && source[i + 1] === "=") {
      tokens.push({ type: "COMPOUND", value: "/=" });
      i += 2;
      continue;
    }
    if (ch === "%" && i + 1 < source.length && source[i + 1] === "=") {
      tokens.push({ type: "COMPOUND", value: "%=" });
      i += 2;
      continue;
    }
    if (ch === "+" || ch === "*" || ch === "/" || ch === "%") {
      tokens.push({ type: "OP", value: ch });
      i++;
      continue;
    }
    if (ch === "&" && i + 1 < source.length && source[i + 1] === "&") {
      tokens.push({ type: "AND" });
      i += 2;
      continue;
    }
    if (ch === "|" && i + 1 < source.length && source[i + 1] === "|") {
      tokens.push({ type: "OR" });
      i += 2;
      continue;
    }
    if (ch === "<" && i + 1 < source.length && source[i + 1] === "=") {
      tokens.push({ type: "CMP", value: "<=" });
      i += 2;
      continue;
    }
    if (ch === ">" && i + 1 < source.length && source[i + 1] === "=") {
      tokens.push({ type: "CMP", value: ">=" });
      i += 2;
      continue;
    }
    if (ch === "<") {
      tokens.push({ type: "CMP", value: "<" });
      i++;
      continue;
    }
    if (ch === ">") {
      tokens.push({ type: "CMP", value: ">" });
      i++;
      continue;
    }
    if (ch === "=" && i + 1 < source.length && source[i + 1] === "=") {
      tokens.push({ type: "CMP", value: "==" });
      i += 2;
      continue;
    }
    if (ch === "!") {
      if (i + 1 < source.length && source[i + 1] === "=") {
        tokens.push({ type: "CMP", value: "!=" });
        i += 2;
      } else {
        tokens.push({ type: "NOT" });
        i++;
      }
      continue;
    }
    if (ch === "=" && i + 1 < source.length && source[i + 1] === ">") {
      tokens.push({ type: "ARROW" });
      i += 2;
      continue;
    }
    if (ch === "=") {
      tokens.push({ type: "OP", value: ch });
      i++;
      continue;
    }
    if (ch === ":") {
      tokens.push({ type: "COLON" });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: "COMMA" });
      i++;
      continue;
    }
    if (ch === ".") {
      if (i + 1 < source.length && source[i + 1] === ".") {
        tokens.push({ type: "RANGE" });
        i += 2;
      } else {
        tokens.push({ type: "DOT" });
        i++;
      }
      continue;
    }
    if (ch === "-") {
      // Check if this is -= compound assignment
      if (i + 1 < source.length && source[i + 1] === "=") {
        tokens.push({ type: "COMPOUND", value: "-=" });
        i += 2;
        continue;
      }
      // Check if this is a negative number literal (followed by digit)
      if (i + 1 < source.length && source[i + 1] >= "0" && source[i + 1] <= "9") {
        i++; // skip '-'
        tokens.push(parseNumberLiteral(source, i, true));
        i = tokens[tokens.length - 1]._end;
        continue;
      }
      tokens.push({ type: "OP", value: "-" });
      i++;
      continue;
    }
    if (ch >= "0" && ch <= "9") {
      tokens.push(parseNumberLiteral(source, i, false));
      i = tokens[tokens.length - 1]._end;
      continue;
    }
    // Handle identifiers and keywords
    if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_") {
      let ident = "";
      while (i < source.length && ((source[i] >= "a" && source[i] <= "z") || (source[i] >= "A" && source[i] <= "Z") || (source[i] >= "0" && source[i] <= "9") || source[i] === "_")) {
        ident += source[i];
        i++;
      }
      if (ident === "let") {
        tokens.push({ type: "LET" });
      } else if (ident === "mut") {
        tokens.push({ type: "MUT" });
      } else if (ident === "return") {
        tokens.push({ type: "RETURN" });
      } else if (ident === "if") {
        tokens.push({ type: "IF" });
      } else if (ident === "else") {
        tokens.push({ type: "ELSE" });
      } else if (ident === "while") {
        tokens.push({ type: "WHILE" });
      } else if (ident === "for") {
        tokens.push({ type: "FOR" });
      } else if (ident === "in") {
        tokens.push({ type: "IN" });
      } else if (ident === "fn") {
        tokens.push({ type: "FN" });
      } else if (ident === "struct") {
        tokens.push({ type: "STRUCT" });
      } else if (ident === "true") {
        tokens.push({ type: "BOOL", value: true });
      } else if (ident === "false") {
        tokens.push({ type: "BOOL", value: false });
      } else {
        tokens.push({ type: "IDENTIFIER", value: ident });
      }
      continue;
    }
    throw new Error(`Unexpected character: ${ch}`);
  }
  tokens.push({ type: "EOF" });
  return tokens;
}
