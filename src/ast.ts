// ---- Token Types ----

export interface NumberToken {
  type: "number";
  value: number;
}
export interface BooleanToken {
  type: "boolean";
  value: boolean;
}
export interface IdentifierToken {
  type: "identifier";
  name: string;
}
export interface LetToken {
  type: "let";
}
export interface MutToken {
  type: "mut";
}
export interface EqualsToken {
  type: "equals";
}
export interface SemicolonToken {
  type: "semicolon";
}
export interface PlusToken {
  type: "plus";
}
export interface MinusToken {
  type: "minus";
}
export interface StarToken {
  type: "star";
}
export interface SlashToken {
  type: "slash";
}
export interface PipePipeToken {
  type: "pipe_pipe";
}
export interface AmpAmpToken {
  type: "amp_amp";
}
export interface LessThanToken {
  type: "less_than";
}
export interface DotToken {
  type: "dot";
}
export interface EOFToken {
  type: "eof";
}

export type Token =
  | NumberToken
  | BooleanToken
  | IdentifierToken
  | LetToken
  | MutToken
  | EqualsToken
  | SemicolonToken
  | PlusToken
  | MinusToken
  | StarToken
  | SlashToken
  | PipePipeToken
  | AmpAmpToken
  | LessThanToken
  | DotToken
  | EOFToken;

// ---- AST Node Types ----

export interface NumberNode {
  kind: "number";
  value: number;
}
export interface BooleanNode {
  kind: "boolean";
  value: boolean;
}
export interface IdentifierNode {
  kind: "identifier";
  name: string;
}
export interface MemberAccessNode {
  kind: "member_access";
  object: ASTNode;
  property: string;
}
export interface BinaryOpNode {
  kind: "binary_op";
  left: ASTNode;
  op: string;
  right: ASTNode;
}
export interface AssignNode {
  kind: "assign";
  name: string;
  value: ASTNode;
}
export interface LetDeclNode {
  kind: "let_decl";
  name: string;
  value: ASTNode;
  isMut?: boolean;
}

export type ASTNode =
  | NumberNode
  | BooleanNode
  | IdentifierNode
  | MemberAccessNode
  | BinaryOpNode
  | AssignNode
  | LetDeclNode;

// ---- Operator Table ----

export interface OperatorInfo {
  symbol: string;
  precedence: number;
  associativity?: "left" | "right";
}

// Single source of truth for binary operators.
// Keyed by token type so the parser and tokenizer share one definition.
export const OPERATORS = new Map<Token["type"], OperatorInfo>([
  ["pipe_pipe", { symbol: "||", precedence: 5 }],
  ["amp_amp", { symbol: "&&", precedence: 6 }],
  ["less_than", { symbol: "<", precedence: 8 }],
  ["plus", { symbol: "+", precedence: 10 }],
  ["minus", { symbol: "-", precedence: 10 }],
  ["star", { symbol: "*", precedence: 20 }],
  ["slash", { symbol: "/", precedence: 20 }],
]);
