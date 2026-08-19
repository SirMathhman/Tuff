import type { Program, Statement, Value } from "./ast.js";
import { err, ok, type Err, type EvalError, type Result } from "./errors.js";
import type { Token } from "./lexer.js";

type Range = { start: number; end: number };

/**
 * Group tokens into top-level statement ranges, flattening `{ ... }` blocks.
 * A stray `}` at depth 0 marks the remainder as a single malformed statement.
 */
function collectStatementRanges(tokens: Token[]): Range[] {
  const ranges: Range[] = [];
  let depth = 0;
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.kind === "semicolon") {
      i++;
      continue;
    }
    if (token.kind === "rbrace") {
      if (depth === 0) {
        ranges.push({ start: i, end: tokens.length });
        break;
      }
      depth--;
      i++;
      continue;
    }
    if (token.kind === "lbrace") {
      depth++;
      i++;
      continue;
    }
    let j = i;
    while (j < tokens.length && tokens[j].kind !== "semicolon" && tokens[j].kind !== "rbrace") {
      j++;
    }
    ranges.push({ start: i, end: j });
    i = j;
  }
  return ranges;
}

/** Parse a value token (number, bool, or ident) at the given range offset. */
function parseValue(tokens: Token[], rangeStart: number, offset: number): Value | undefined {
  const token = tokens[rangeStart + offset];
  if (token?.kind === "number") {
    return { kind: "number", value: token.value };
  }
  if (token?.kind === "bool") {
    return { kind: "bool", value: token.value };
  }
  if (token?.kind === "ident") {
    return { kind: "ident", name: token.value };
  }
  return undefined;
}

/**
 * Parse one statement range into a `Statement`, or return an `UnexpectedStatement` error.
 */
function parseStatement(
  tokens: Token[],
  source: string,
  range: Range,
  index: number,
): Result<Statement, EvalError> {
  const at = (offset: number) => tokens[range.start + offset];
  const statementText = () =>
    source
      .slice(
        tokens[range.start].position,
        range.end < tokens.length ? tokens[range.end].position : source.length,
      )
      .trim();
  const unexpected = (): Err<EvalError> =>
    err({ kind: "UnexpectedStatement", statement: statementText(), index });

  if (at(0)?.kind === "let") {
    let offset = 1;
    let mutable = false;
    if (at(offset)?.kind === "mut") {
      mutable = true;
      offset++;
    }
    const name = at(offset);
    if (name?.kind !== "ident" || at(offset + 1)?.kind !== "assign") {
      return unexpected();
    }
    const value = parseValue(tokens, range.start, offset + 2);
    if (!value || range.start + offset + 3 !== range.end) {
      return unexpected();
    }
    return ok({ kind: "let", name: name.value, mutable, value, index });
  }

  if (at(0)?.kind === "return") {
    const value = parseValue(tokens, range.start, 1);
    if (!value || range.start + 2 !== range.end) {
      return unexpected();
    }
    return ok({ kind: "return", value, index });
  }

  const name = at(0);
  if (name?.kind === "ident" && at(1)?.kind === "assign") {
    const value = parseValue(tokens, range.start, 2);
    if (!value || range.start + 3 !== range.end) {
      return unexpected();
    }
    return ok({ kind: "assign", name: name.value, value, index });
  }

  return unexpected();
}

/**
 * Parse a token stream into a program.
 * @param tokens - The token list from `tokenize`.
 * @param source - The original source text (used for error messages).
 * @returns A `Result` carrying the program, or a structured `EvalError`.
 */
export function parse(tokens: Token[], source: string): Result<Program, EvalError> {
  const ranges = collectStatementRanges(tokens);
  if (ranges.length === 0) {
    return err({ kind: "EmptyProgram" });
  }
  const statements: Statement[] = [];
  for (let index = 0; index < ranges.length; index++) {
    const statement = parseStatement(tokens, source, ranges[index], index);
    if (!statement.ok) {
      return statement;
    }
    statements.push(statement.value);
  }
  return ok({ statements });
}
