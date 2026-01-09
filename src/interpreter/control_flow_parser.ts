/**
 * Unified control flow statement parser.
 * Handles if/while/for statement parsing with consistent patterns.
 */
import { findMatchingParen } from "../interpreter_helpers";
import { ErrorCode, throwError } from "../runtime/errors";

export interface ControlFlowConfig {
  type: "if" | "while" | "for";
  keyword: string;
  hasElse: boolean;
}

export interface ParsedControlFlow {
  condition: string;
  body: string;
  elseBody?: string;
  rest?: string;
}

function findBracedEndOrThrow(s: string, type: string): number {
  const bEnd = findMatchingParen(s, { start: 0, open: "{", close: "}" });
  if (bEnd === -1) throwError(ErrorCode.UNBALANCED_BRACES, { type });
  return bEnd;
}

/**
 * Parse control flow header (condition + bodies)
 */
export function parseControlFlowHeader(
  stmt: string,
  config: ControlFlowConfig
): ParsedControlFlow {
  if (!new RegExp(`^${config.keyword}\\b`).test(stmt)) {
    throwError(ErrorCode.INVALID_SYNTAX, { type: config.keyword });
  }

  const start = stmt.indexOf("(");
  if (start === -1)
    throwError(ErrorCode.INVALID_SYNTAX, { type: config.keyword });

  const endIdx = findMatchingParen(stmt, { start });
  if (endIdx === -1)
    throwError(ErrorCode.UNBALANCED_PARENS, { type: config.keyword });

  const condition = stmt.slice(start + 1, endIdx).trim();
  let rest = stmt.slice(endIdx + 1).trim();

  if (!rest) throwError(ErrorCode.MISSING_BODY, { type: config.keyword });

  // Parse body (braced block or single statement)
  let body = "";
  let elseBody: string | undefined = undefined;

  if (rest.startsWith("{")) {
    const bEnd = findBracedEndOrThrow(rest, config.keyword);
    body = rest.slice(0, bEnd + 1).trim();
    rest = rest.slice(bEnd + 1).trim();
  } else {
    // Single statement body; could be followed by 'else <body>' in the same statement
    let elseIdx = rest.indexOf(" else ");
    if (elseIdx === -1) elseIdx = rest.indexOf("else");
    if (elseIdx !== -1) {
      body = rest.slice(0, elseIdx).trim();
      rest = rest.slice(elseIdx + 6).trim(); // " else " or "else"
    } else {
      body = rest.trim();
      rest = "";
    }
  }

  // Parse else body if exists
  if (config.hasElse && rest) {
    if (rest.startsWith("{")) {
      const bEnd = findBracedEndOrThrow(rest, `${config.keyword} else`);
      elseBody = rest.slice(0, bEnd + 1).trim();
    } else {
      elseBody = rest.trim();
    }
  }

  return { condition, body, elseBody, rest };
}
