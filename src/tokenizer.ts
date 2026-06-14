import type { Token, OpToken } from "./types.js";

export function isOp(token: Token): token is OpToken {
  return token.type === "op";
}

/** Helper to get the current token. */
export function peek(tokens: Token[], pos: [number]): Token | undefined {
  return tokens[pos[0]];
}

/** Helper to consume and return the current token, advancing position. */
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
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    // Dot for property access (check BEFORE number, since . matches /[0-9.]/)
    if (ch === ".") {
      tokens.push({ type: "op", value: "." });
      i++;
      continue;
    }
    // Number (integer or decimal, with optional leading minus handled by parser)
    if (/[0-9.]/.test(ch)) {
      let num = "";
      while (i < input.length && /[0-9.]/.test(input.charAt(i))) {
        num += input.charAt(i++);
      }
      // Optional type suffix: U8, I32, F64, etc.
      let typeSuffix = undefined;
      if (i < input.length && /[a-zA-Z_]/.test(input.charAt(i))) {
        const beforeI = i;
        while (i < input.length && /[a-zA-Z0-9_]/.test(input.charAt(i))) {
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
    } else if (/[a-zA-Z_$]/.test(ch)) {
      let name = "";
      while (i < input.length && /[a-zA-Z0-9_$]/.test(input.charAt(i))) {
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
    } else if (ch === "." && !/[0-9]/.test(input.charAt(i + 1) ?? "")) {
      tokens.push({ type: "op", value: "." });
      i++;
    } else if (ch === ":") {
      tokens.push({ type: "op", value: ":" });
      i++;
    } else {
      throw new Error(`Unexpected character: ${ch}`);
    }
  }
  return tokens;
}
