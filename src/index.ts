// Stage 0: TypeScript
// Tuff Compiler - Public API

// Lexer exports
export type { Lexer, Token, Position, SourceLocation } from "./lexer/types"
export { TokenType } from "./lexer/types"
export type { LexerOutput, LexError } from "./lexer/types"

// Parser exports
export type { Parser, ParserOutput, ParseError } from "./parser"

// AST exports
export * from "./ast"

// Analyzer exports
export type { Symbol, TypeInfo, AnalysisError, AnalyzerOutput } from "./analyzer"
export { ErrorCode, SymbolTable } from "./analyzer"

// Codegen exports
export type { CodeGenerator, CodegenOutput, CodegenOptions } from "./codegen"
export { EmissionContext } from "./codegen"

// Compiler exports
export type { Compiler, CompileOutput, CompilerOptions } from "./compiler"
