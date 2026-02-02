"use strict";

const KEYWORDS = new Set([
  "fn",
  "let",
  "mut",
  "if",
  "else",
  "match",
  "case",
  "while",
  "for",
  "in",
  "extern",
  "use",
  "from",
  "true",
  "false",
  "null",
  "break",
  "continue",
  "struct",
  "enum",
  "is"
]);

const TWO_CHAR = new Set(["==", "!=", "<=", ">=", "+=", "-=", "*=", "/=", "%=", "&&", "||", "..", "::", "=>"]);
  "==",
  "!=",
  "<=",
  ">=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "&&",
  "||",
  "..",
  "::",
]);
const ONE_CHAR = new Set([
  "(",
  ")",
  "{",
  "}",
  "[",
  "]",
  ",",
  ";",
  ".",
  ":",
  "+",
  "-",
  "*",
  "/",
  "%",
  "=",
  "<",
  ">",
  "!",
]);

module.exports = { KEYWORDS, TWO_CHAR, ONE_CHAR };
