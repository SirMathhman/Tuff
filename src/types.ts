// --- AST Node Types ---
export interface NumberLiteral {
  type: "number";
  value: number;
}

export interface Identifier {
  type: "identifier";
  name: string;
}

export interface BinaryOp {
  type: "binary_op";
  op: "+" | "-" | "*" | "/" | "||" | "&&" | "<" | ">" | "<=" | ">=";
  left: AstNode;
  right: AstNode;
}

export interface LetDeclaration {
  type: "let";
  name: string;
  mutable: boolean;
  init: AstNode;
}

export interface AssignExpr {
  type: "assign_expr";
  name: string;
  value: AstNode;
}

export interface Block {
  type: "block";
  statements: AstNode[];
}

export interface BoolLiteral {
  type: "bool";
  value: boolean;
}

export interface IfExpr {
  type: "if_expr";
  condition: AstNode;
  then: AstNode;
  else_: AstNode | null;
}

export interface WhileExpr {
  type: "while_expr";
  condition: AstNode;
  body: AstNode;
}

export interface ContinueStmt {
  type: "continue";
}

export interface BreakStmt {
  type: "break";
}

export interface MatchArm {
  pattern: MatchPattern;
  body: AstNode;
}

export interface WildcardPattern {
  type: "wildcard";
}

export interface NumberPattern {
  type: "number";
  value: number;
}

export interface IdentifierPattern {
  type: "identifier";
  name: string;
}

export type MatchPattern = WildcardPattern | NumberPattern | IdentifierPattern;

export interface MatchExpr {
  type: "match_expr";
  scrutinee: AstNode;
  arms: MatchArm[];
}

export type AstNode =
  | NumberLiteral
  | Identifier
  | BinaryOp
  | LetDeclaration
  | AssignExpr
  | Block
  | BoolLiteral
  | IfExpr
  | WhileExpr
  | ContinueStmt
  | BreakStmt
  | MatchExpr;

// --- Token Types ---
export interface NumberToken {
  type: "number";
  value: number;
}

export interface IdentifierToken {
  type: "identifier";
  name: string;
}

export interface LetKeyword {
  type: "let_keyword";
}

export interface MutKeyword {
  type: "mut_keyword";
}

export interface IfKeyword {
  type: "if_keyword";
}

export interface ElseKeyword {
  type: "else_keyword";
}

export interface WhileKeyword {
  type: "while_keyword";
}

export interface ContinueKeyword {
  type: "continue_keyword";
}

export interface BreakKeyword {
  type: "break_keyword";
}

export interface MatchKeyword {
  type: "match_keyword";
}

export interface CaseKeyword {
  type: "case_keyword";
}

export interface UnderscoreKeyword {
  type: "underscore_keyword";
}

export interface ArrowToken {
  type: "arrow";
}

export interface AssignToken {
  type: "assign";
}

export interface PlusAssignToken {
  type: "plus_assign";
}

export interface MinusAssignToken {
  type: "minus_assign";
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

export interface MultiplyToken {
  type: "multiply";
}

export interface DivideToken {
  type: "divide";
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

export interface TrueKeyword {
  type: "true_keyword";
}

export interface FalseKeyword {
  type: "false_keyword";
}

export interface LessEqualToken {
  type: "less_equal";
}

export interface GreaterEqualToken {
  type: "greater_equal";
}

export interface GreaterToken {
  type: "greater";
}

export interface LessToken {
  type: "less";
}

export interface AndToken {
  type: "and";
}

export interface OrToken {
  type: "or";
}

export type Token =
  | NumberToken
  | IdentifierToken
  | LetKeyword
  | MutKeyword
  | TrueKeyword
  | FalseKeyword
  | IfKeyword
  | ElseKeyword
  | WhileKeyword
  | ContinueKeyword
  | BreakKeyword
  | MatchKeyword
  | CaseKeyword
  | UnderscoreKeyword
  | ArrowToken
  | AssignToken
  | PlusAssignToken
  | MinusAssignToken
  | SemicolonToken
  | AndToken
  | OrToken
  | LessEqualToken
  | GreaterEqualToken
  | GreaterToken
  | LessToken
  | PlusToken
  | MinusToken
  | MultiplyToken
  | DivideToken
  | LParenToken
  | RParenToken
  | LBraceToken
  | RBraceToken;

export function isNumberToken(token: Token): token is NumberToken {
  return token.type === "number";
}

export function isIdentifierToken(token: Token): token is IdentifierToken {
  return token.type === "identifier";
}

// Keywords that look like identifiers but are reserved
export const KEYWORDS = new Set([
  "let",
  "mut",
  "true",
  "false",
  "if",
  "else",
  "while",
  "continue",
  "break",
  "match",
  "case",
  "_",
]);

// --- Evaluator Types ---
export interface EvalValue {
  type: "value";
  value: number;
}

export interface EvalVoid {
  type: "void";
}

export type EvalResult = EvalValue | EvalVoid | EvalSignal;

export interface EvalSignal {
  type: "signal";
  signal: "continue" | "break";
}

export interface ScopeEntry {
  value: number;
  mutable: boolean;
}

export interface ScopeFrame {
  locals: Map<string, ScopeEntry>;
  parent: ScopeFrame | null;
}

export type Scope = ScopeFrame;

// --- Binary Operator Registry (single source of truth) ---
export interface BinaryOpInfo {
  prec: number;
  eval: (left: number, right: number) => number;
}

export const BINARY_OPS: Record<BinaryOp["op"], BinaryOpInfo> = {
  "||": { prec: 1, eval: (l, r) => (l !== 0 || r !== 0 ? 1 : 0) },
  "&&": { prec: 2, eval: (l, r) => (l !== 0 && r !== 0 ? 1 : 0) },
  "<=": { prec: 3, eval: (l, r) => (l <= r ? 1 : 0) },
  ">=": { prec: 3, eval: (l, r) => (l >= r ? 1 : 0) },
  "<": { prec: 3, eval: (l, r) => (l < r ? 1 : 0) },
  ">": { prec: 3, eval: (l, r) => (l > r ? 1 : 0) },
  "+": { prec: 4, eval: (l, r) => l + r },
  "-": { prec: 4, eval: (l, r) => l - r },
  "*": { prec: 5, eval: (l, r) => l * r },
  "/": { prec: 5, eval: (l, r) => Math.trunc(l / r) },
};

// Compound assignment token type → binary operator mapping
export const COMPOUND_ASSIGN_OPS: Record<string, BinaryOp["op"]> = {
  plus_assign: "+",
  minus_assign: "-",
};
