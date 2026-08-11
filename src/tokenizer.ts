import type { AstNode } from "./ast";

export type Token =
  | ["num", number]
  | ["bool", boolean]
  | ["op", "+" | "-" | "*" | "/" | "&&" | "||" | "=="]
  | ["group", "(" | ")" | "{" | "}"]
  | ["kw", "let" | "mut"]
  | ["id", string]
  | ["assign", "="]
  | ["semi", ";"]
  | ["ref", "&"]
  | ["str", string];

export function tokenize(source: string): Token[] {
  const result: Token[] = [];
  const re = /"([^"]*)"|(\d+\.?\d*|[+\-*/(){}=;&]|[a-zA-Z_][a-zA-Z0-9_]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const [text, strContent] = match;
    if (text === " " || text === "") continue;
    if (strContent !== undefined) {
      result.push(["str", strContent]);
      continue;
    }
    if (text === "+" || text === "-" || text === "*" || text === "/") {
      result.push(["op", text as "+" | "-" | "*" | "/"]);
    } else if (text === "&&" || text === "||" || text === "==") {
      result.push(["op", text as "&&" | "||" | "=="]);
    } else if (text === "&") {
      result.push(["ref", "&"]);
    } else if (text === "(" || text === ")" || text === "{" || text === "}") {
      result.push(["group", text as "(" | ")" | "{" | "}"]);
    } else if (text === "=") {
      result.push(["assign", "="]);
    } else if (text === ";") {
      result.push(["semi", ";"]);
    } else if (text === "let") {
      result.push(["kw", "let"]);
    } else if (text === "mut") {
      result.push(["kw", "mut"]);
    } else if (text === "true") {
      result.push(["bool", true]);
    } else if (text === "false") {
      result.push(["bool", false]);
    } else if (/^[a-zA-Z_]/.test(text)) {
      result.push(["id", text]);
    } else {
      result.push(["num", Number(text)]);
    }
  }
  return result;
}
