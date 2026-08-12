import type { AstNode } from "./ast";
import { INT_TYPES, numberRegex, matchSuffix, type IntTypeName } from "./types";

const COMPOUND_OPS: Record<string, string> = { "+=": "+", "-=": "-" };
export { COMPOUND_OPS };

export type Token =
  | ["num", number, IntTypeName | undefined]
  | ["bool", boolean]
  | [
      "op",
      (
        | "+"
        | "-"
        | "*"
        | "/"
        | "&&"
        | "||"
        | "=="
        | "<"
        | "<="
        | ">"
        | ">="
        | "!="
        | ".."
        | ","
        | "."
      ),
    ]
  | ["group", "(" | ")" | "{" | "}" | "[" | "]"]
  | [
      "kw",
      (
        | "let"
        | "mut"
        | "if"
        | "else"
        | "while"
        | "break"
        | "continue"
        | "for"
        | "in"
      ),
    ]
  | ["id", string]
  | ["assign", "=" | "+=" | "-="]
  | ["semi", ";"]
  | ["ref", "&"]
  | ["colon", ":"]
  | ["str", string];

export function tokenize(source: string): Token[] {
  const result: Token[] = [];
  const typedNums = numberRegex();
  const re = new RegExp(
    `"([^"]*)"|(${typedNums}|\\d+|\\d+\\.\\d+|\\+=|-=|<=|>=|!=|\\.\\.|[+\\-*/(){}=;&<>[\\],:.]|[a-zA-Z_][a-zA-Z0-9_]*)`,
    "g",
  );
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
    } else if (
      text === "&&" ||
      text === "||" ||
      text === "==" ||
      text === "<" ||
      text === "<=" ||
      text === ">" ||
      text === ">=" ||
      text === "!=" ||
      text === ".." ||
      text === "," ||
      text === "."
    ) {
      result.push([
        "op",
        text as
          | "&&"
          | "||"
          | "=="
          | "<"
          | "<="
          | ">"
          | ">="
          | "!="
          | ".."
          | ","
          | ".",
      ]);
    } else if (text === "&") {
      result.push(["ref", "&"]);
    } else if (
      text === "(" ||
      text === ")" ||
      text === "{" ||
      text === "}" ||
      text === "[" ||
      text === "]"
    ) {
      result.push(["group", text as "(" | ")" | "{" | "}" | "[" | "]"]);
    } else if (text === "=") {
      result.push(["assign", "="]);
    } else if (COMPOUND_OPS[text]) {
      result.push(["assign", text as "+=" | "-="]);
    } else if (text === ";") {
      result.push(["semi", ";"]);
    } else if (text === ":") {
      result.push(["colon", ":"]);
    } else if (text === "let") {
      result.push(["kw", "let"]);
    } else if (text === "mut") {
      result.push(["kw", "mut"]);
    } else if (text === "if") {
      result.push(["kw", "if"]);
    } else if (text === "else") {
      result.push(["kw", "else"]);
    } else if (text === "while") {
      result.push(["kw", "while"]);
    } else if (text === "break") {
      result.push(["kw", "break"]);
    } else if (text === "continue") {
      result.push(["kw", "continue"]);
    } else if (text === "for") {
      result.push(["kw", "for"]);
    } else if (text === "in") {
      result.push(["kw", "in"]);
    } else if (text === "true") {
      result.push(["bool", true]);
    } else if (text === "false") {
      result.push(["bool", false]);
    } else if (/^[a-zA-Z_]/.test(text)) {
      result.push(["id", text]);
    } else {
      const suffix = matchSuffix(text);
      if (suffix) {
        const t = INT_TYPES.find((t) => t.name === suffix)!;
        result.push(["num", Number(text.slice(0, -t.suffix.length)), suffix]);
      } else {
        result.push(["num", Number(text), undefined]);
      }
    }
  }
  return result;
}
