import { TYPE_SUFFIXES } from "./grammar";

export type Token =
  | { type: "number"; value: number }
  | {
      type: "operator";
      value:
        | "+"
        | "-"
        | "*"
        | "/"
        | "="
        | "=="
        | "!="
        | "<="
        | ">="
        | "||"
        | "&&"
        | "<"
        | ">"
        | "+=";
    }
  | { type: "group"; value: "(" | ")" | "{" | "}" }
  | {
      type: "keyword";
      value:
        | "let"
        | "mut"
        | "true"
        | "false"
        | "if"
        | "else"
        | "loop"
        | "break"
        | "while";
    }
  | { type: "identifier"; value: string }
  | { type: "punctuator"; value: ";" };

function isUnaryContext(tokens: Token[]): boolean {
  if (tokens.length === 0) return true;
  const last = tokens[tokens.length - 1]!;
  if (last.type === "group") return last.value === "(" || last.value === "{";
  if (last.type === "operator") return true;
  if (last.type === "punctuator") return true;
  return false;
}

function readDigits(
  source: string,
  start: number,
): { numStr: string; end: number } {
  let numStr = "";
  let i = start;
  while (i < source.length) {
    const c = source.charAt(i);
    if (c < "0" || c > "9") break;
    numStr += c;
    i++;
  }
  return { numStr, end: i };
}

function parseNumberWithSuffix(
  tokens: Token[],
  source: string,
  numStr: string,
  i: number,
): number {
  // Validate and skip type suffixes using TYPE_SUFFIXES table
  const suffixDef = TYPE_SUFFIXES.find((s) => s.prefix === source.charAt(i));
  if (suffixDef) {
    i++;
    let suffixNum = "";
    while (
      i < source.length &&
      source.charAt(i) >= "0" &&
      source.charAt(i) <= "9"
    ) {
      suffixNum += source.charAt(i);
      i++;
    }
    const numValue = Number(numStr);
    const bits = Number(suffixNum);
    const minVal = suffixDef.min(bits);
    const maxVal = suffixDef.max(bits);
    if (numValue < minVal || numValue > maxVal) {
      throw new Error(
        `Value ${numValue} out of range for ${suffixDef.prefix}${suffixNum} (${minVal}-${maxVal})`,
      );
    }
  }
  tokens.push({ type: "number", value: Number(numStr) });
  return i;
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source.charAt(i);
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
    } else if (ch >= "0" && ch <= "9") {
      const { numStr, end } = readDigits(source, i);
      i = parseNumberWithSuffix(tokens, source, numStr, end);
    } else if (
      ch === "-" &&
      i + 1 < source.length &&
      source.charAt(i + 1) >= "0" &&
      source.charAt(i + 1) <= "9" &&
      isUnaryContext(tokens)
    ) {
      i++;
      const { numStr, end } = readDigits(source, i);
      i = parseNumberWithSuffix(tokens, source, "-" + numStr, end);
    } else if ((ch >= "a" && ch <= "z") || ch === "_") {
      let ident = "";
      while (
        i < source.length &&
        ((source.charAt(i) >= "a" && source.charAt(i) <= "z") ||
          source.charAt(i) === "_")
      ) {
        ident += source.charAt(i);
        i++;
      }
      if (ident === "let") {
        tokens.push({ type: "keyword", value: "let" });
      } else if (ident === "true") {
        tokens.push({ type: "keyword", value: "true" });
      } else if (ident === "false") {
        tokens.push({ type: "keyword", value: "false" });
      } else if (ident === "if") {
        tokens.push({ type: "keyword", value: "if" });
      } else if (ident === "else") {
        tokens.push({ type: "keyword", value: "else" });
      } else if (ident === "mut") {
        tokens.push({ type: "keyword", value: "mut" });
      } else if (ident === "loop") {
        tokens.push({ type: "keyword", value: "loop" });
      } else if (ident === "break") {
        tokens.push({ type: "keyword", value: "break" });
      } else if (ident === "while") {
        tokens.push({ type: "keyword", value: "while" });
      } else {
        tokens.push({ type: "identifier", value: ident });
      }
    } else if (ch === "+") {
      if (i + 1 < source.length && source.charAt(i + 1) === "=") {
        tokens.push({ type: "operator", value: "+=" });
        i += 2;
      } else {
        tokens.push({ type: "operator", value: "+" });
        i++;
      }
    } else if (ch === "-") {
      tokens.push({ type: "operator", value: "-" });
      i++;
    } else if (ch === "*") {
      tokens.push({ type: "operator", value: "*" });
      i++;
    } else if (ch === "/") {
      tokens.push({ type: "operator", value: "/" });
      i++;
    } else if (ch === "|") {
      if (i + 1 < source.length && source.charAt(i + 1) === "|") {
        tokens.push({ type: "operator", value: "||" });
        i += 2;
      } else {
        i++;
      }
    } else if (ch === "&") {
      if (i + 1 < source.length && source.charAt(i + 1) === "&") {
        tokens.push({ type: "operator", value: "&&" });
        i += 2;
      } else {
        i++;
      }
    } else if (ch === "<") {
      if (i + 1 < source.length && source.charAt(i + 1) === "=") {
        tokens.push({ type: "operator", value: "<=" });
        i += 2;
      } else {
        tokens.push({ type: "operator", value: "<" });
        i++;
      }
    } else if (ch === ">") {
      if (i + 1 < source.length && source.charAt(i + 1) === "=") {
        tokens.push({ type: "operator", value: ">=" });
        i += 2;
      } else {
        tokens.push({ type: "operator", value: ">" });
        i++;
      }
    } else if (ch === "=") {
      if (i + 1 < source.length && source.charAt(i + 1) === "=") {
        tokens.push({ type: "operator", value: "==" });
        i += 2;
      } else {
        tokens.push({ type: "operator", value: "=" });
        i++;
      }
    } else if (ch === "!") {
      if (i + 1 < source.length && source.charAt(i + 1) === "=") {
        tokens.push({ type: "operator", value: "!=" });
        i += 2;
      } else {
        i++;
      }
    } else if (ch === ";") {
      tokens.push({ type: "punctuator", value: ";" });
      i++;
    } else if (ch === "(") {
      tokens.push({ type: "group", value: "(" });
      i++;
    } else if (ch === ")") {
      tokens.push({ type: "group", value: ")" });
      i++;
    } else if (ch === "{") {
      tokens.push({ type: "group", value: "{" });
      i++;
    } else if (ch === "}") {
      tokens.push({ type: "group", value: "}" });
      i++;
    } else {
      i++;
    }
  }
  return tokens;
}
