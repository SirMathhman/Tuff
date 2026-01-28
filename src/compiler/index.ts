// Stage 0: TypeScript
// Compiler pipeline orchestration

import type { LexerOutput } from "../lexer/types"
import type { ParserOutput } from "../parser"
import type { AnalyzerOutput } from "../analyzer"
import type { CodegenOutput, CodegenOptions } from "../codegen"

/**
 * Complete compiler pipeline output
 */
export interface CompileOutput {
  source: string
  lexing: LexerOutput
  parsing: ParserOutput
  analysis?: AnalyzerOutput
  codegen?: CodegenOutput
  success: boolean
  allErrors: Array<{
    phase: "lexing" | "parsing" | "analysis" | "codegen"
    errors: unknown[]
  }>
}

/**
 * Compiler interface
 */
export interface Compiler {
  /**
   * Full compilation pipeline from source to TypeScript
   */
  compile(source: string, options?: CompilerOptions): CompileOutput

  /**
   * Individual phase execution for testing/debugging
   */
  lex(source: string): LexerOutput
  parse(tokens: ReturnType<any>[]): ParserOutput
  analyze(ast: any): AnalyzerOutput
  generate(ast: any, analysis: AnalyzerOutput, options?: CodegenOptions): CodegenOutput
}

/**
 * Compiler options
 */
export interface CompilerOptions {
  /**
   * Continue through errors or fail fast
   */
  continueOnError?: boolean

  /**
   * Code generation target
   */
  target?: "typescript" | "javascript"

  /**
   * Emit source maps
   */
  sourceMap?: boolean

  /**
   * Minify output
   */
  minify?: boolean

  /**
   * Module name for imports/exports
   */
  moduleName?: string
}
