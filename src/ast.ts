import type { TuffValue } from "./values.ts";

/** A literal expression node (number or boolean). */
export interface LiteralNode {
  kind: "Literal";
  value: TuffValue;
}

/** An identifier expression node. */
export interface IdentifierNode {
  kind: "Identifier";
  name: string;
}

/** A binary `||` expression node. */
export interface OrNode {
  kind: "Or";
  left: TuffExpr;
  right: TuffExpr;
}

/** A binary `&&` expression node. */
export interface AndNode {
  kind: "And";
  left: TuffExpr;
  right: TuffExpr;
}

/** A binary `+` expression node. */
export interface AddNode {
  kind: "Add";
  left: TuffExpr;
  right: TuffExpr;
}

/** A binary `==` expression node. */
export interface EqualNode {
  kind: "Equal";
  left: TuffExpr;
  right: TuffExpr;
}

/** A binary `<` expression node. */
export interface LessNode {
  kind: "Less";
  left: TuffExpr;
  right: TuffExpr;
}

/** A prefix `&` reference expression node. */
export interface RefNode {
  kind: "Ref";
  mut: boolean;
  operand: TuffExpr;
}

/** A prefix `*` dereference expression node. */
export interface DerefNode {
  kind: "Deref";
  operand: TuffExpr;
}

/** A tuple literal expression node: `(e, e, ...)`. */
export interface TupleNode {
  kind: "Tuple";
  elements: TuffExpr[];
}

/** A tuple-index expression node: `tuple.N`. */
export interface TupleIndexNode {
  kind: "TupleIndex";
  operand: TuffExpr;
  index: number;
}

/** An array literal expression node: `[e, e, ...]`. */
export interface ArrayNode {
  kind: "Array";
  elements: TuffExpr[];
}

/** An array-index expression node: `array[i]`. */
export interface ArrayIndexNode {
  kind: "ArrayIndex";
  operand: TuffExpr;
  index: TuffExpr;
}

/** A range expression node: `start..end`, a half-open integer range. */
export interface RangeNode {
  kind: "Range";
  left: TuffExpr;
  right: TuffExpr;
}

/** A parsed tuff expression. */
export type TuffExpr =
  | LiteralNode
  | IdentifierNode
  | OrNode
  | AndNode
  | AddNode
  | EqualNode
  | LessNode
  | RefNode
  | DerefNode
  | TupleNode
  | TupleIndexNode
  | ArrayNode
  | ArrayIndexNode
  | RangeNode;

/** A `let` declaration statement node. */
export interface LetNode {
  kind: "Let";
  mut: boolean;
  name: string;
  value: TuffExpr;
}

/** An assignment statement node. */
export interface AssignNode {
  kind: "Assign";
  target: TuffExpr;
  value: TuffExpr;
}

/** A `return` statement node. */
export interface ReturnNode {
  kind: "Return";
  value: TuffExpr;
}

/** A braced block statement node. */
export interface BlockNode {
  kind: "Block";
  statements: TuffStatement[];
}

/** An `if` statement node with an optional `else` branch. */
export interface IfNode {
  kind: "If";
  condition: TuffExpr;
  then: TuffStatement;
  else: TuffStatement | null;
}

/** A `while` loop statement node. */
export interface WhileNode {
  kind: "While";
  condition: TuffExpr;
  body: TuffStatement;
}

/** A `for (name in range)` loop statement node. */
export interface ForNode {
  kind: "For";
  name: string;
  range: TuffExpr;
  body: TuffStatement;
}

/** A `break` statement node that exits the enclosing loop. */
export interface BreakNode {
  kind: "Break";
}

/** A `continue` statement node that skips to the next loop iteration. */
export interface ContinueNode {
  kind: "Continue";
}

/** A parsed tuff statement. */
export type TuffStatement =
  | LetNode
  | AssignNode
  | ReturnNode
  | BlockNode
  | IfNode
  | WhileNode
  | ForNode
  | BreakNode
  | ContinueNode;

/** A mutable parse position over a token list. */
export interface Pos {
  i: number;
}
