// ---- Token Types ----

export interface NumberToken {
  type: "number";
  value: number;
  // Optional type suffix, e.g. "U8" in "100U8".
  suffix?: string;
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
export interface IfToken {
  type: "if";
}
export interface ElseToken {
  type: "else";
}
export interface WhileToken {
  type: "while";
}
export interface LParenToken {
  type: "lparen";
}
export interface RParenToken {
  type: "rparen";
}
export interface LBraceToken {
  type: "lbrace";
}
export interface RBraceToken {
  type: "rbrace";
}
export interface EqualsToken {
  type: "equals";
}
export interface EqualsEqualsToken {
  type: "equals_equals";
}
export interface BangEqualsToken {
  type: "bang_equals";
}
export interface SemicolonToken {
  type: "semicolon";
}
export interface PlusToken {
  type: "plus";
}
export interface PlusEqualsToken {
  type: "plus_equals";
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
export interface LessThanEqualToken {
  type: "less_than_equal";
}
export interface GreaterThanToken {
  type: "greater_than";
}
export interface GreaterThanEqualToken {
  type: "greater_than_equal";
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
  | IfToken
  | ElseToken
  | WhileToken
  | LParenToken
  | RParenToken
  | LBraceToken
  | RBraceToken
  | EqualsToken
  | EqualsEqualsToken
  | BangEqualsToken
  | SemicolonToken
  | PlusToken
  | PlusEqualsToken
  | MinusToken
  | StarToken
  | SlashToken
  | PipePipeToken
  | AmpAmpToken
  | LessThanToken
  | LessThanEqualToken
  | GreaterThanToken
  | GreaterThanEqualToken
  | DotToken
  | EOFToken;

// ---- AST Node Types ----

export interface NumberNode {
  kind: "number";
  value: number;
  // Optional type suffix, e.g. "U8" in "100U8".
  suffix?: string;
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
export interface IfNode {
  kind: "if";
  condition: ASTNode;
  thenBranch: ASTNode;
  // elseBranch is optional: an `if` used as a statement may omit it, but an
  // `if` used as a value must have one (a value must always be produced).
  elseBranch?: ASTNode;
}
export interface BlockNode {
  kind: "block";
  statements: ASTNode[];
}
export interface WhileNode {
  kind: "while";
  condition: ASTNode;
  body: ASTNode;
}

export type ASTNode =
  | NumberNode
  | BooleanNode
  | IdentifierNode
  | MemberAccessNode
  | BinaryOpNode
  | AssignNode
  | LetDeclNode
  | IfNode
  | BlockNode
  | WhileNode;

// A node is a pure expression if it produces a value without side effects.
// Declarations (let_decl) and assignments (assign) are statements, not
// pure expressions.
export function isExpression(node: ASTNode): boolean {
  return node.kind !== "let_decl" && node.kind !== "assign";
}

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
  ["less_than_equal", { symbol: "<=", precedence: 8 }],
  ["greater_than", { symbol: ">", precedence: 8 }],
  ["greater_than_equal", { symbol: ">=", precedence: 8 }],
  ["equals_equals", { symbol: "==", precedence: 8 }],
  ["bang_equals", { symbol: "!=", precedence: 8 }],
  ["plus", { symbol: "+", precedence: 10 }],
  ["minus", { symbol: "-", precedence: 10 }],
  ["star", { symbol: "*", precedence: 20 }],
  ["slash", { symbol: "/", precedence: 20 }],
]);
