import type { Token, Result, CompileError, EnumDefinitionNode } from "./types";
import type { ParseContext } from "./parse-expressions";
import {
  expectToken as expectTokenHelper,
  unexpectedEofError,
  unexpectedTokenError,
} from "./parse-helpers";

function expectToken(
  ctx: ParseContext,
  type: string,
  expected: string,
): Result<Token, CompileError> {
  return expectTokenHelper(ctx, type, expected);
}

export function parseEnumDefinition(
  ctx: ParseContext,
  exported: boolean,
): Result<EnumDefinitionNode, CompileError> {
  const enumToken = peek(ctx);
  if (!enumToken) return unexpectedEofError("enum");
  consume(ctx);
  const nameToken = peek(ctx);
  if (!nameToken)
    return unexpectedTokenError(
      { type: "EOF", value: "", line: 0, column: 0 },
      "enum name",
    );
  if (nameToken.type !== "IDENTIFIER")
    return unexpectedTokenError(nameToken, "enum name");
  consume(ctx);
  const braceResult = expectToken(ctx, "LBRACE", "{");
  if (!braceResult.isOk) return braceResult;
  const variantsResult = parseEnumVariants(ctx, nameToken.value);
  if (!variantsResult.isOk) return variantsResult;
  const closeResult = expectToken(ctx, "RBRACE", "}");
  if (!closeResult.isOk) return closeResult;
  consumeOptionalSemicolon(ctx);
  if (variantsResult.value.length === 0)
    return emptyEnumError(nameToken.value, enumToken);
  return {
    isOk: true,
    value: {
      type: "EnumDefinition",
      name: nameToken.value,
      variants: variantsResult.value,
      exported,
      line: enumToken.line,
      column: enumToken.column,
    },
  };
}

function parseEnumVariants(
  ctx: ParseContext,
  enumName: string,
): Result<string[], CompileError> {
  const variants: string[] = [];
  while (true) {
    const next = peek(ctx);
    if (!next) return unexpectedEofError("'}' or variant name");
    if (next.type === "RBRACE") break;
    const variantResult = parseEnumVariant(ctx, variants, enumName);
    if (!variantResult.isOk) return variantResult;
    const after = peek(ctx);
    if (!after || after.type !== "COMMA") break;
    consume(ctx);
  }
  return { isOk: true, value: variants };
}

function parseEnumVariant(
  ctx: ParseContext,
  variants: string[],
  enumName: string,
): Result<void, CompileError> {
  const next = peek(ctx);
  if (!next || next.type !== "IDENTIFIER")
    return unexpectedTokenError(
      next || { type: "EOF", value: "", line: 0, column: 0 },
      "variant name",
    );
  const name = next.value;
  if (isReservedWord(name)) return unexpectedTokenError(next, "variant name");
  if (/^\d/.test(name)) return unexpectedTokenError(next, "variant name");
  if (variants.includes(name))
    return duplicateVariantError(name, enumName, next);
  consume(ctx);
  variants.push(name);
  return { isOk: true, value: undefined };
}

function isReservedWord(name: string): boolean {
  return (
    name === "enum" ||
    name === "out" ||
    name === "let" ||
    name === "struct" ||
    name === "type"
  );
}

function emptyEnumError(
  name: string,
  token: Token,
): Result<never, CompileError> {
  return {
    isOk: false,
    error: {
      message: "Empty enum '" + name + "'",
      reason: "Enums must have at least one variant.",
      suggestedFix: "Add at least one variant.",
      line: token.line,
      column: token.column,
    },
  };
}

function duplicateVariantError(
  name: string,
  enumName: string,
  token: Token,
): Result<never, CompileError> {
  return {
    isOk: false,
    error: {
      message: "Duplicate variant '" + name + "' in enum '" + enumName + "'",
      reason: "Enum variants must have unique names.",
      suggestedFix: "Remove or rename the duplicate variant.",
      line: token.line,
      column: token.column,
    },
  };
}

function consumeOptionalSemicolon(ctx: ParseContext) {
  const next = peek(ctx);
  if (next && next.type === "SEMICOLON") consume(ctx);
}

import { peek, consume } from "./parse-expressions";
