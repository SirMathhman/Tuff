import type { Token, OpToken } from "./types.js";
import {
  isSpace,
  isDigit,
  isDigitOrDot,
  isAlpha,
  isAlphaNum as isAlphaNumOrUnderscore,
  isWordStart,
  isWordCharFull as isWordChar,
} from "./char-utils.js";

export function isOp(token: Token): token is OpToken {
  return token.type === "op";
}
export function peek(tokens: Token[], pos: [number]): Token | undefined {
  return tokens[pos[0]];
}
export function consume(tokens: Token[], pos: [number]): Token {
  const token = tokens[pos[0]++];
  if (!token) throw new Error("Unexpected end of input");
  return token;
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input.charAt(i);
    if (isSpace(ch)) {
      i++;
      continue;
    }
    // Dot for property access (check BEFORE number)
    if (ch === ".") {
      tokens.push({ type: "op", value: "." });
      i++;
      continue;
    }
    // Number (integer or decimal, with optional leading minus handled by parser)
    if (isDigitOrDot(ch)) {
      let num = "";
      while (i < input.length && isDigitOrDot(input.charAt(i))) {
        num += input.charAt(i++);
      }
      // Optional type suffix: U8, I32, F64, etc.
      let typeSuffix = undefined;
      if (i < input.length && isAlpha(input.charAt(i))) {
        const beforeI = i;
        while (i < input.length && isAlphaNumOrUnderscore(input.charAt(i))) {
          i++;
        }
        typeSuffix = input.slice(beforeI, i);
      }
      tokens.push({
        type: "number",
        value: parseFloat(num),
        suffix: typeSuffix,
      });
    } else if ("+-*/&".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
    } else if (ch === "=" && input.charAt(i + 1) === ">") {
      tokens.push({ type: "op", value: "=>" });
      i += 2;
    } else if (
      "<>=!:".includes(ch) ||
      (ch === "<" && input.charAt(i + 1) === "=") ||
      (ch === ">" && input.charAt(i + 1) === "=") ||
      (ch === "=" && input.charAt(i + 1) === "=")
    ) {
      let op = ch;
      if (
        (ch === "<" || ch === ">") &&
        i + 1 < input.length &&
        input.charAt(i + 1) === "="
      ) {
        op += "=";
        i++;
      } else if (
        ch === "=" &&
        i + 1 < input.length &&
        input.charAt(i + 1) === "="
      ) {
        op = "==";
        i++;
      } else if (
        ch === "!" &&
        i + 1 < input.length &&
        input.charAt(i + 1) === "="
      ) {
        op = "!=";
        i++;
      }
      tokens.push({ type: "op", value: op });
      i++;
    } else if (isWordStart(ch)) {
      let name = "";
      while (i < input.length && isWordChar(input.charAt(i))) {
        name += input.charAt(i++);
      }
      if (name === "true") {
        tokens.push({ type: "boolean", value: true });
      } else if (name === "false") {
        tokens.push({ type: "boolean", value: false });
      } else if (
        name === "if" ||
        name === "else" ||
        name === "while" ||
        name === "for" ||
        name === "fn"
      ) {
        tokens.push({ type: "keyword", value: name });
      } else {
        tokens.push({ type: "id", value: name });
      }
    } else if (ch === "[") {
      tokens.push({ type: "op", value: "[" });
      i++;
    } else if (ch === "]") {
      tokens.push({ type: "op", value: "]" });
      i++;
    } else if (ch === "{" || ch === "}") {
      tokens.push({ type: "op", value: ch });
      i++;
    } else if (ch === ")" || ch === "(") {
      tokens.push({ type: "op", value: ch });
      i++;
    } else if (ch === ",") {
      i++;
    } else if (ch === "." && !isDigit(input.charAt(i + 1) ?? "")) {
      tokens.push({ type: "op", value: "." });
      i++;
    } else if (ch === ":") {
      tokens.push({ type: "op", value: ":" });
      i++;
    } else {
      throw new Error("Unexpected character: " + ch);
    }
  }
  return tokens;
}
