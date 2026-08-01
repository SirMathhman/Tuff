// ---- Token Types ----

export interface NumberToken {
  type: "number";
  value: number;
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
export interface DotToken {
  type: "dot";
}
export interface EOFToken {
  type: "eof";
}

export type Token =
  | NumberToken
  | IdentifierToken
  | LetToken
  | MutToken
  | EqualsToken
  | SemicolonToken
  | PlusToken
  | MinusToken
  | StarToken
  | SlashToken
  | DotToken
  | EOFToken;

// ---- AST Node Types ----

export interface NumberNode {
  kind: "number";
  value: number;
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
  | IdentifierNode
  | MemberAccessNode
  | BinaryOpNode
  | AssignNode
  | LetDeclNode;

// ---- Precedence Table ----

export const PRECEDENCE: Record<string, number> = {
  "+": 10,
  "-": 10,
  "*": 20,
  "/": 20,
};
