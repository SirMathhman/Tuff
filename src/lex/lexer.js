"use strict";

const { KEYWORDS, TWO_CHAR, ONE_CHAR } = require("./tokenKinds");

function isAlpha(ch) {
  return /[A-Za-z_]/.test(ch);
}

function isDigit(ch) {
  return /[0-9]/.test(ch);
}

function isAlphaNum(ch) {
  return isAlpha(ch) || isDigit(ch);
}

function lex(source, filePath) {
  const tokens = [];
  let i = 0;
  let line = 1;
  let col = 1;

  function current() {
    return source[i];
  }

  function next() {
    const ch = source[i++];
    if (ch === "\n") {
      line += 1;
      col = 1;
    } else {
      col += 1;
    }
    return ch;
  }

  function addToken(type, value, startLine, startCol, endLine, endCol) {
    tokens.push({
      type,
      value,
      span: { filePath, startLine, startCol, endLine, endCol },
    });
  }

  function error(msg) {
    throw new Error(`${filePath}:${line}:${col} ${msg}`);
  }

  while (i < source.length) {
    const ch = current();

    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      next();
      continue;
    }

    if (ch === "/" && source[i + 1] === "/") {
      while (i < source.length && current() !== "\n") {
        next();
      }
      continue;
    }

    if (ch === "/" && source[i + 1] === "*") {
      next();
      next();
      while (i < source.length) {
        if (current() === "*" && source[i + 1] === "/") {
          next();
          next();
          break;
        }
        next();
      }
      continue;
    }

    if (isDigit(ch)) {
      const startLine = line;
      const startCol = col;
      let value = "";
      while (i < source.length && isDigit(current())) {
        value += next();
      }
      if (current() === "." && isDigit(source[i + 1])) {
        value += next();
        while (i < source.length && isDigit(current())) {
          value += next();
        }
      }
      addToken("number", value, startLine, startCol, line, col - 1);
      continue;
    }

    if (isAlpha(ch)) {
      const startLine = line;
      const startCol = col;
      let value = "";
      while (i < source.length && isAlphaNum(current())) {
        value += next();
      }
      let type = KEYWORDS.has(value) ? value : "ident";
      if (value === "_") {
        type = "_";
      }
      addToken(type, value, startLine, startCol, line, col - 1);
      continue;
    }

    if (ch === '"') {
      const startLine = line;
      const startCol = col;
      next();
      let value = "";
      while (i < source.length && current() !== '"') {
        if (current() === "\\") {
          next();
          const esc = current();
          if (!"ntr\\\"'".includes(esc)) {
            error(`Invalid escape: \\${esc}`);
          }
          value += "\\" + esc;
          next();
          continue;
        }
        value += next();
      }
      if (current() !== '"') {
        error("Unterminated string literal");
      }
      next();
      addToken("string", value, startLine, startCol, line, col - 1);
      continue;
    }

    if (ch === "'") {
      const startLine = line;
      const startCol = col;
      next();
      let value = "";
      if (current() === "\\") {
        next();
        const esc = current();
        if (!"ntr\\\"'".includes(esc)) {
          error(`Invalid escape: \\${esc}`);
        }
        value = "\\" + esc;
        next();
      } else {
        value = next();
      }
      if (current() !== "'") {
        error("Unterminated char literal");
      }
      next();
      addToken("char", value, startLine, startCol, line, col - 1);
      continue;
    }

    const two = source.slice(i, i + 2);
    if (TWO_CHAR.has(two)) {
      const startLine = line;
      const startCol = col;
      next();
      next();
      addToken(two, two, startLine, startCol, line, col - 1);
      continue;
    }

    if (ONE_CHAR.has(ch)) {
      const startLine = line;
      const startCol = col;
      next();
      addToken(ch, ch, startLine, startCol, line, col - 1);
      continue;
    }

    error(`Unexpected character: ${ch}`);
  }

  tokens.push({
    type: "eof",
    value: "",
    span: {
      filePath,
      startLine: line,
      startCol: col,
      endLine: line,
      endCol: col,
    },
  });
  return tokens;
}

module.exports = { lex };
