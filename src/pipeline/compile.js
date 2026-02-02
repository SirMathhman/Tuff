"use strict";

const { lex } = require("../lex/lexer");
const { parse } = require("../parse/parser");
const { resolveProgram } = require("../sem/resolve");
const { desugar } = require("../lower/desugar");
const { emitProgram } = require("../codegen/emitter");

function compile({ source, filePath, emitTokens = false, emitAst = false }) {
  const tokens = lex(source, filePath);
  if (emitTokens) {
    return { tokens };
  }
  const ast = parse(tokens, filePath, source);
  if (emitAst) {
    return { ast };
  }
  const resolved = resolveProgram(ast);
  const lowered = desugar(resolved);
  const code = emitProgram(lowered);
  return { code };
}

module.exports = { compile };
