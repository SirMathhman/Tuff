import { type Token, KEYWORDS } from "./types";

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === " ") {
      i++;
    } else if (ch >= "0" && ch <= "9") {
      let numStr = "";
      while (i < source.length && source[i]! >= "0" && source[i]! <= "9") {
        numStr += source[i]!;
        i++;
      }
      tokens.push({ type: "number", value: Number(numStr) });
    } else if (
      (ch >= "a" && ch <= "z") ||
      (ch >= "A" && ch <= "Z") ||
      ch === "_"
    ) {
      let name = "";
      while (
        i < source.length &&
        ((source[i]! >= "a" && source[i]! <= "z") ||
          (source[i]! >= "A" && source[i]! <= "Z") ||
          (source[i]! >= "0" && source[i]! <= "9") ||
          source[i] === "_")
      ) {
        name += source[i]!;
        i++;
      }
      if (KEYWORDS.has(name)) {
        if (name === "let") {
          tokens.push({ type: "let_keyword" as const });
        } else if (name === "mut") {
          tokens.push({ type: "mut_keyword" as const });
        } else if (name === "true") {
          tokens.push({ type: "true_keyword" as const });
        } else if (name === "false") {
          tokens.push({ type: "false_keyword" as const });
        } else if (name === "if") {
          tokens.push({ type: "if_keyword" as const });
        } else if (name === "else") {
          tokens.push({ type: "else_keyword" as const });
        } else if (name === "while") {
          tokens.push({ type: "while_keyword" as const });
        } else if (name === "continue") {
          tokens.push({ type: "continue_keyword" as const });
        } else if (name === "break") {
          tokens.push({ type: "break_keyword" as const });
        } else if (name === "match") {
          tokens.push({ type: "match_keyword" as const });
        } else if (name === "case") {
          tokens.push({ type: "case_keyword" as const });
        } else if (name === "_") {
          tokens.push({ type: "underscore_keyword" as const });
        }
      } else {
        tokens.push({ type: "identifier", name });
      }
    } else if (ch === "+") {
      if (i + 1 < source.length && source[i + 1] === "=") {
        tokens.push({ type: "plus_assign" });
        i += 2;
      } else {
        tokens.push({ type: "plus" });
        i++;
      }
    } else if (ch === "-") {
      if (i + 1 < source.length && source[i + 1] === "=") {
        tokens.push({ type: "minus_assign" });
        i += 2;
      } else {
        tokens.push({ type: "minus" });
        i++;
      }
    } else if (ch === "*") {
      tokens.push({ type: "multiply" });
      i++;
    } else if (ch === "/") {
      tokens.push({ type: "divide" });
      i++;
    } else if (ch === "=") {
      if (i + 1 < source.length && source[i + 1] === ">") {
        tokens.push({ type: "arrow" });
        i += 2;
      } else {
        tokens.push({ type: "assign" });
        i++;
      }
    } else if (ch === ";") {
      tokens.push({ type: "semicolon" });
      i++;
    } else if (ch === "&") {
      if (i + 1 < source.length && source[i + 1] === "&") {
        tokens.push({ type: "and" });
        i += 2;
      } else {
        throw new Error(`Unexpected character '&' at position ${i}`);
      }
    } else if (ch === "|") {
      if (i + 1 < source.length && source[i + 1] === "|") {
        tokens.push({ type: "or" });
        i += 2;
      } else {
        throw new Error(`Unexpected character '|' at position ${i}`);
      }
    } else if (ch === ">") {
      if (i + 1 < source.length && source[i + 1] === "=") {
        tokens.push({ type: "greater_equal" });
        i += 2;
      } else {
        tokens.push({ type: "greater" });
        i++;
      }
    } else if (ch === "<") {
      if (i + 1 < source.length && source[i + 1] === "=") {
        tokens.push({ type: "less_equal" });
        i += 2;
      } else {
        tokens.push({ type: "less" });
        i++;
      }
    } else if (ch === "(") {
      tokens.push({ type: "lparen" });
      i++;
    } else if (ch === ")") {
      tokens.push({ type: "rparen" });
      i++;
    } else if (ch === "{") {
      tokens.push({ type: "lbrace" });
      i++;
    } else if (ch === "}") {
      tokens.push({ type: "rbrace" });
      i++;
    } else {
      throw new Error(`Unexpected character '${ch}' at position ${i}`);
    }
  }
  return tokens;
}
