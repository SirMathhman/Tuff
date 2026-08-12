import {
  INT_TYPES,
  FLOAT_TYPES,
  numberRegex,
  matchSuffix,
  type TypeName,
} from "./types";

const COMPOUND_OPS: Record<string, string> = { "+=": "+", "-=": "-" };
export { COMPOUND_OPS };

export type Token =
  | ["num", number, TypeName | undefined, boolean]
  | ["bool", boolean]
  | ["char", string]
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
        | "=>"
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
        | "is"
        | "fn"
        | "type"
        | "struct"
      ),
    ]
  | ["id", string]
  | ["assign", "=" | "+=" | "-="]
  | ["semi", ";"]
  | ["ref", "&"]
  | ["colon", ":"];

export function tokenize(source: string): Token[] {
  const result: Token[] = [];
  const typedNums = numberRegex();
  const re = new RegExp(
    `(${typedNums}|\\d+\\.\\d+(?:${FLOAT_TYPES.map((t) => t.suffix).join("|")})|\\d+(?:${FLOAT_TYPES.map((t) => t.suffix).join("|")})|'[^']'|\\d+\\.\\d+|\\d+|\\+=|-=|<=|>=|!=|==|\\.\\.|=>|&&|\\|{2}|[+\\-*/(){}=;&<>[\\],:.]|[a-zA-Z_][a-zA-Z0-9_]*)`,
    "g",
  );
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const [text] = match;
    if (text === "+" || text === "-" || text === "*" || text === "/") {
      result.push(["op", text as "+" | "-" | "*" | "/"]);
    } else if (text === "=>") {
      result.push(["op", "=>"]);
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
    } else if (text === "is") {
      result.push(["kw", "is"]);
    } else if (text === "fn") {
      result.push(["kw", "fn"]);
    } else if (text === "type") {
      result.push(["kw", "type"]);
    } else if (text === "struct") {
      result.push(["kw", "struct"]);
    } else if (text === "true") {
      result.push(["bool", true]);
    } else if (text === "false") {
      result.push(["bool", false]);
    } else if (/^[a-zA-Z_]/.test(text)) {
      result.push(["id", text]);
    } else if (
      text.startsWith("'") &&
      text.endsWith("'") &&
      text.length === 3
    ) {
      result.push(["char", text.slice(1, 2)]);
    } else {
      const suffix = matchSuffix(text);
      if (suffix) {
        const intType = INT_TYPES.find((t) => t.name === suffix);
        if (intType) {
          result.push([
            "num",
            Number(text.slice(0, -intType.suffix.length)),
            suffix,
            false,
          ]);
        } else {
          const floatType = FLOAT_TYPES.find((t) => t.name === suffix)!;
          result.push([
            "num",
            Number(text.slice(0, -floatType.suffix.length)),
            suffix,
            true,
          ]);
        }
      } else {
        const isFloat = text.includes(".");
        result.push(["num", Number(text), undefined, isFloat]);
      }
    }
  }
  return result;
}
