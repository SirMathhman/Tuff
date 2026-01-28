// Stage 0: TypeScript
// Code generation types and interfaces

import type { Program } from "../ast"
import type { AnalyzerOutput } from "../analyzer"

/**
 * Code generation options
 */
export interface CodegenOptions {
  target: "typescript" | "javascript"
  sourceMap: boolean
  minify: boolean
  emitDeclarations: boolean
}

/**
 * Code generation output
 */
export interface CodegenOutput {
  code: string
  sourceMap?: string
  declarations?: string
}

/**
 * Code generator interface
 */
export interface CodeGenerator {
  generate(ast: Program, analysis: AnalyzerOutput, options: CodegenOptions): CodegenOutput
}

/**
 * Emission context for code generation
 */
export class EmissionContext {
  private indent = 0
  private output = ""

  write(text: string): void {
    this.output += text
  }

  writeLine(text: string = ""): void {
    this.output += "  ".repeat(this.indent) + text + "\n"
  }

  increaseIndent(): void {
    this.indent++
  }

  decreaseIndent(): void {
    if (this.indent > 0) {
      this.indent--
    }
  }

  getOutput(): string {
    return this.output
  }

  clear(): void {
    this.output = ""
    this.indent = 0
  }
}
