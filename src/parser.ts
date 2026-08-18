import type { AstNode } from "./ast.js";
import type { TuffError } from "./errors.js";
import type { Token } from "./lexer.js";
import type { Result } from "./result.js";

function fail(input: string, message: string): Result<AstNode, TuffError> {
  return {
    ok: false,
    error: {
      kind: "unsupported_expression",
      input,
      message,
    },
  };
}

/**
 * Parses a token list into an AST.
 *
 * @param tokens - The tokens produced by the lexer.
 * @param input - The raw input, carried into errors for diagnostics.
 * @returns A Result holding the AST, or a structured error.
 */
export function parse(tokens: Token[], input: string): Result<AstNode, TuffError> {
  let index = 0;

  function parseNumber(): Result<AstNode, TuffError> {
    const token = tokens[index];

    if (token?.kind !== "number") {
      return fail(input, "Expected a number");
    }

    index += 1;
    return { ok: true, value: { kind: "number", value: token.value } };
  }

  // A term is a number with `*` applied (higher precedence than `+`/`-`).
  function parseTerm(): Result<AstNode, TuffError> {
    const left = parseNumber();
    if (!left.ok) {
      return left;
    }

    let node: AstNode = left.value;

    while (tokens[index]?.kind === "times") {
      index += 1;
      const right = parseNumber();
      if (!right.ok) {
        return right;
      }
      node = { kind: "binary", op: "times", left: node, right: right.value };
    }

    return { ok: true, value: node };
  }

  // An expression is a term with `+`/`-` applied (lower precedence).
  function parseExpression(): Result<AstNode, TuffError> {
    const left = parseTerm();
    if (!left.ok) {
      return left;
    }

    let node: AstNode = left.value;

    let op = tokens[index]?.kind;
    while (op === "plus" || op === "minus") {
      index += 1;
      const right = parseTerm();
      if (!right.ok) {
        return right;
      }
      node = { kind: "binary", op, left: node, right: right.value };
      op = tokens[index]?.kind;
    }

    return { ok: true, value: node };
  }

  const result = parseExpression();
  if (!result.ok) {
    return result;
  }

  if (index < tokens.length) {
    return fail(input, "Unexpected trailing tokens");
  }

  return result;
}
