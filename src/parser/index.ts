// Stage 0: TypeScript
// Parser types and interfaces

import type { Token } from "../lexer/types"
import type { Program } from "../ast"
import type { SourceLocation } from "../lexer/types"

/**
 * Parser interface
 */
export interface Parser {
  parse(tokens: Token[]): ParserOutput
}

/**
 * Parser output containing AST and any parsing errors
 */
export interface ParserOutput {
  ast?: Program
  errors: ParseError[]
}

/**
 * Parse error information
 */
export interface ParseError {
  message: string
  location: SourceLocation
  token?: Token
  hint?: string
}
