import { TYPE_SUFFIXES } from "./grammar";

export type Token =
  | { type: "number"; value: number; typeSuffix?: string }
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
        | "while"
        | "is";
    }
  | { type: "identifier"; value: string }
  | { type: "punctuator"; value: ";" | ":" };

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
  let typeSuffix: string | undefined;
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
    typeSuffix = suffixDef.prefix + suffixNum;
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
  tokens.push({ type: "number", value: Number(numStr), typeSuffix });
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
    } else if (
      (ch >= "A" && ch <= "Z") ||
      (ch >= "a" && ch <= "z") ||
      ch === "_"
    ) {
      let ident = "";
      while (
        i < source.length &&
        ((source.charAt(i) >= "A" && source.charAt(i) <= "Z") ||
          (source.charAt(i) >= "a" && source.charAt(i) <= "z") ||
          source.charAt(i) === "_" ||
          (source.charAt(i) >= "0" && source.charAt(i) <= "9"))
      ) {
        ident += source.charAt(i);
        i++;
      }
      const lower = ident.toLowerCase();
      if (lower === "let") {
        tokens.push({ type: "keyword", value: "let" });
      } else if (lower === "true") {
        tokens.push({ type: "keyword", value: "true" });
      } else if (lower === "false") {
        tokens.push({ type: "keyword", value: "false" });
      } else if (lower === "if") {
        tokens.push({ type: "keyword", value: "if" });
      } else if (lower === "else") {
        tokens.push({ type: "keyword", value: "else" });
      } else if (lower === "mut") {
        tokens.push({ type: "keyword", value: "mut" });
      } else if (lower === "loop") {
        tokens.push({ type: "keyword", value: "loop" });
      } else if (lower === "break") {
        tokens.push({ type: "keyword", value: "break" });
      } else if (lower === "while") {
        tokens.push({ type: "keyword", value: "while" });
      } else if (lower === "is") {
        tokens.push({ type: "keyword", value: "is" });
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
    } else if (ch === ":") {
      tokens.push({ type: "punctuator", value: ":" });
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
