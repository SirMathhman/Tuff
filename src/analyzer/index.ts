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
export interface SymbolTableState {
  readonly scopes: ReadonlyArray<ReadonlyMap<string, Symbol>>
}

export function createSymbolTable(): SymbolTableState {
  return { scopes: [new Map()] }
}

export function pushScope(table: SymbolTableState): SymbolTableState {
  return { scopes: [...table.scopes, new Map()] }
}

export function popScope(table: SymbolTableState): SymbolTableState {
  if (table.scopes.length > 1) {
    return { scopes: table.scopes.slice(0, -1) }
  }
  return table
}

export function defineSymbol(table: SymbolTableState, symbol: Symbol): SymbolTableState {
  if (table.scopes.length === 0) return table
  const scopes = [...table.scopes]
  const currentScope = new Map(scopes[scopes.length - 1])
  currentScope.set(symbol.name, symbol)
  scopes[scopes.length - 1] = currentScope as ReadonlyMap<string, Symbol>
  return { scopes }
}

export function lookupSymbol(table: SymbolTableState, name: string): Symbol | undefined {
  for (let i = table.scopes.length - 1; i >= 0; i--) {
    const symbol = table.scopes[i].get(name)
    if (symbol) return symbol
  }
  return undefined
}

export function lookupLocalSymbol(
  table: SymbolTableState,
  name: string,
): Symbol | undefined {
  if (table.scopes.length === 0) return undefined
  return table.scopes[table.scopes.length - 1].get(name)
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
  symbolTable: SymbolTableState
  typeMap: Map<string, TypeInfo>
  errors: AnalysisError[]
}
