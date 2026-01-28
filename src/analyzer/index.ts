// Stage 0: TypeScript
// Semantic analyzer types and interfaces

import type { Program } from "../ast"
import type { SourceLocation } from "../lexer/types"

/**
 * Symbol information for type checking
 */
export interface Symbol {
  name: string
  kind: "variable" | "function" | "type" | "struct" | "enum" | "trait" | "module"
  type: TypeInfo
  isPublic: boolean
  location: SourceLocation
  mutable: boolean
}

/**
 * Type information
 */
export interface TypeInfo {
  name: string
  kind: TypeKind
  isNullable: boolean
}

export type TypeKind =
  | "primitive"
  | "array"
  | "reference"
  | "function"
  | "struct"
  | "enum"
  | "trait"
  | "union"
  | "generic"

/**
 * Symbol table with scope hierarchy
 */
export class SymbolTable {
  private scopes: Map<string, Symbol>[] = [new Map()]

  pushScope(): void {
    this.scopes.push(new Map())
  }

  popScope(): void {
    if (this.scopes.length > 1) {
      this.scopes.pop()
    }
  }

  define(symbol: Symbol): void {
    const currentScope = this.scopes[this.scopes.length - 1]
    currentScope.set(symbol.name, symbol)
  }

  lookup(name: string): Symbol | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const symbol = this.scopes[i].get(name)
      if (symbol) return symbol
    }
    return undefined
  }

  lookupLocal(name: string): Symbol | undefined {
    const currentScope = this.scopes[this.scopes.length - 1]
    return currentScope.get(name)
  }
}

/**
 * Analysis error
 */
export interface AnalysisError {
  message: string
  location: SourceLocation
  code: ErrorCode
}

export enum ErrorCode {
  UndefinedSymbol = "UndefinedSymbol",
  DuplicateDefinition = "DuplicateDefinition",
  TypeMismatch = "TypeMismatch",
  InvalidOperation = "InvalidOperation",
  UnreachableCode = "UnreachableCode",
  BorrowError = "BorrowError",
  MutabilityError = "MutabilityError",
  AccessError = "AccessError",
}

/**
 * Analysis output
 */
export interface AnalyzerOutput {
  ast: Program
  symbolTable: SymbolTable
  typeMap: Map<string, TypeInfo>
  errors: AnalysisError[]
}
