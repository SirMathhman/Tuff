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
export interface EmissionContextState {
  readonly indent: number
  readonly output: string
}

export function createEmissionContext(): EmissionContextState {
  return { indent: 0, output: "" }
}

export function write(context: EmissionContextState, text: string): EmissionContextState {
  return { ...context, output: context.output + text }
}

export function writeLine(context: EmissionContextState, text = ""): EmissionContextState {
  const indented = "  ".repeat(context.indent) + text + "\n"
  return { ...context, output: context.output + indented }
}

export function increaseIndent(context: EmissionContextState): EmissionContextState {
  return { ...context, indent: context.indent + 1 }
}

export function decreaseIndent(context: EmissionContextState): EmissionContextState {
  return {
    ...context,
    indent: context.indent > 0 ? context.indent - 1 : 0,
  }
}

export function getOutput(context: EmissionContextState): string {
  return context.output
}
