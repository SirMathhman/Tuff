import { Result, InterpretError, Value, Token } from "./types";

export interface ParserLike {
  peek(): Token | undefined;
  peekNext(): Token | undefined;
  peekAt(offset: number): Token | undefined;
  consume(): Token | undefined;

  parseExpr(): Result<Value, InterpretError>;
  parseParenthesized(): Result<Value, InterpretError>;

  parseStructDeclaration(): Result<Value, InterpretError>;
  parseLetDeclaration(): Result<Value, InterpretError>;
  parseFunctionDeclaration(): Result<Value, InterpretError>;

  parseCall(name: string): Result<Value, InterpretError>;

  lookupVar(name: string): Value | undefined;
  lookupType(name: string): string[] | undefined;

  assignVar(name: string, value: Value): Result<Value, InterpretError>;

  pushScope(): void;
  popScope(): void;
  createChildParser(tokens: Token[]): ParserLike;

  getTypeScopesPublic(): Map<string, string[]>[];
  getVarTypeScopesPublic(): Map<string, string | undefined>[];
  getVarMutabilityScopesPublic(): Map<string, boolean>[];
  getVarInitializedScopesPublic(): Map<string, boolean>[];
  getScopes(): Map<string, Value>[];

  parse(): Result<Value, InterpretError>;
}
