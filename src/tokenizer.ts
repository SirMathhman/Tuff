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
  | ["string", string]
  | [
      "op",
      (
        | "+"
        | "-"
        | "*"
        | "/"
        | "&&"
        | "||"
        | "|"
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
        | "null"
        | "yield"
      ),
    ]
  | ["id", string]
  | ["assign", "=" | "+=" | "-="]
  | ["semi", ";"]
  | ["ref", "&"]
  | ["colon", ":"];

/** Classify a single matched text into a Token. */
function classifyToken(text: string): Token {
  if (text === "+" || text === "-" || text === "*" || text === "/") {
    return ["op", text as "+" | "-" | "*" | "/"];
  }
  if (text === "=>") {
    return ["op", "=>"];
  }
  if (
    text === "&&" ||
    text === "||" ||
    text === "|" ||
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
    return [
      "op",
      text as
        | "&&"
        | "||"
        | "|"
        | "=="
        | "<"
        | "<="
        | ">"
        | ">="
        | "!="
        | ".."
        | ","
        | ".",
    ];
  }
  if (text === "&") return ["ref", "&"];
  if (
    text === "(" ||
    text === ")" ||
    text === "{" ||
    text === "}" ||
    text === "[" ||
    text === "]"
  ) {
    return ["group", text as "(" | ")" | "{" | "}" | "[" | "]"];
  }
  if (text === "=") return ["assign", "="];
  if (COMPOUND_OPS[text]) return ["assign", text as "+=" | "-="];
  if (text === ";") return ["semi", ";"];
  if (text === ":") return ["colon", ":"];
  if (text === "let") return ["kw", "let"];
  if (text === "mut") return ["kw", "mut"];
  if (text === "if") return ["kw", "if"];
  if (text === "else") return ["kw", "else"];
  if (text === "while") return ["kw", "while"];
  if (text === "break") return ["kw", "break"];
  if (text === "continue") return ["kw", "continue"];
  if (text === "for") return ["kw", "for"];
  if (text === "in") return ["kw", "in"];
  if (text === "is") return ["kw", "is"];
  if (text === "fn") return ["kw", "fn"];
  if (text === "type") return ["kw", "type"];
  if (text === "struct") return ["kw", "struct"];
  if (text === "null") return ["kw", "null"];
  if (text === "yield") return ["kw", "yield"];
  if (text === "true") return ["bool", true];
  if (text === "false") return ["bool", false];
  if (/^[a-zA-Z_]/.test(text)) return ["id", text];
  if (text.startsWith("'") && text.endsWith("'") && text.length === 3) {
    return ["char", text.slice(1, 2)];
  }
  if (text.startsWith('"') && text.endsWith('"')) {
    return ["string", text.slice(1, -1)];
  }
  return classifyNumber(text);
}

/** Classify a number token, handling type suffixes. */
function classifyNumber(text: string): Token {
  const suffix = matchSuffix(text);
  if (suffix) {
    const intType = INT_TYPES.find((t) => t.name === suffix);
    if (intType) {
      return [
        "num",
        Number(text.slice(0, -intType.suffix.length)),
        suffix,
        false,
      ];
    }
    const floatType = FLOAT_TYPES.find((t) => t.name === suffix)!;
    return [
      "num",
      Number(text.slice(0, -floatType.suffix.length)),
      suffix,
      true,
    ];
  }
  const isFloat = text.includes(".");
  return ["num", Number(text), undefined, isFloat];
}

export function tokenize(source: string): Token[] {
  const result: Token[] = [];
  const typedNums = numberRegex();
  const re = new RegExp(
    `(${typedNums}|\\d+\\.\\d+(?:${FLOAT_TYPES.map((t) => t.suffix).join("|")})|\\d+(?:${FLOAT_TYPES.map((t) => t.suffix).join("|")})|'[^']'|"[^"]*"|\\d+\\.\\d+|\\d+|\\+=|-=|<=|>=|!=|==|\\.\\.|=>|&&|\\|{2}|\\||[+\\-*/(){}=;&<>[\\],:.]|[a-zA-Z_][a-zA-Z0-9_]*)`,
    "g",
  );
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const [text] = match;
    result.push(classifyToken(text));
  }
  return result;
}
