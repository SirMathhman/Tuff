import { Result, InterpretError, Value, Token } from "./types";

export interface TokenReader {
  peek(): Token | undefined;
  peekNext(): Token | undefined;
  peekAt(offset: number): Token | undefined;
  consume(): Token | undefined;
}

export interface ParseOps {
  parseExpr(): Result<Value, InterpretError>;
  parseParenthesized(): Result<Value, InterpretError>;
  parseStructDeclaration(): Result<Value, InterpretError>;
  parseLetDeclaration(): Result<Value, InterpretError>;
  parseFunctionDeclaration(): Result<Value, InterpretError>;
  parseCall(name: string): Result<Value, InterpretError>;
  parse(): Result<Value, InterpretError>;
}

export interface LookupOps {
  lookupVar(name: string): Value | undefined;
  lookupType(name: string): string[] | undefined;
}

export interface AssignmentOps {
  assignVar(name: string, value: Value): Result<Value, InterpretError>;
}

export interface ScopeOps {
  pushScope(): void;
  popScope(): void;
  createChildParser(tokens: Token[]): ParserLike;
}

export interface ScopeIntrospectionOps {
  getTypeScopesPublic(): Map<string, string[]>[];
  getVarTypeScopesPublic(): Map<string, string | undefined>[];
  getVarMutabilityScopesPublic(): Map<string, boolean>[];
  getVarInitializedScopesPublic(): Map<string, boolean>[];
  getScopes(): Map<string, Value>[];
}

export interface ParserLike
  extends TokenReader,
    ParseOps,
    LookupOps,
    AssignmentOps,
    ScopeOps,
    ScopeIntrospectionOps {}
