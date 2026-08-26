/**
 * A numeric literal expression.
 */
export interface NumberExpr {
  type: "Number";
  value: number;
  pos: number;
}

/**
 * An identifier reference expression.
 */
export interface IdentifierExpr {
  type: "Identifier";
  name: string;
  pos: number;
}

/**
 * A boolean literal expression.
 */
export interface BooleanExpr {
  type: "Boolean";
  value: boolean;
  pos: number;
}

/**
 * A binary operator expression.
 */
export interface BinaryExpr {
  type: "Binary";
  op: "||" | "==" | "<" | "+" | "-" | "*";
  left: Expr;
  right: Expr;
  pos: number;
}

/**
 * A tuple literal expression: a comma-separated list of expressions.
 */
export interface TupleExpr {
  type: "Tuple";
  elements: Expr[];
  pos: number;
}

/**
 * A field access expression: reads an element of a tuple by index.
 */
export interface FieldAccessExpr {
  type: "FieldAccess";
  object: Expr;
  index: number;
  pos: number;
}

/**
 * A reference expression: takes the address of its operand variable.
 */
export interface RefExpr {
  type: "Ref";
  operand: Expr;
  pos: number;
}

/**
 * A dereference expression: reads the value pointed to by its operand.
 */
export interface DerefExpr {
  type: "Deref";
  operand: Expr;
  pos: number;
}

/**
 * A block expression: runs its statements in a nested scope and produces
 * the value the block returns (0 when it returns nothing).
 */
export interface BlockExpr {
  type: "BlockExpr";
  stmts: Stmt[];
  pos: number;
}

/**
 * An expression: a number or boolean literal, an identifier reference,
 * a binary operator expression, a tuple literal, a field access, a
 * reference, a dereference, or a block.
 */
export type Expr =
  | NumberExpr
  | IdentifierExpr
  | BooleanExpr
  | BinaryExpr
  | TupleExpr
  | FieldAccessExpr
  | RefExpr
  | DerefExpr
  | BlockExpr;

/**
 * A `let` (optionally `mut`) variable declaration.
 */
export interface LetDecl {
  type: "LetDecl";
  mutable: boolean;
  name: string;
  value: Expr;
}

/**
 * An assignment to a variable.
 */
export interface Assign {
  type: "Assign";
  name: string;
  value: Expr;
  pos: number;
}

/**
 * A return statement.
 */
export interface Return {
  type: "Return";
  value: Expr;
}

/**
 * A block of statements delimited by braces.
 */
export interface Block {
  type: "Block";
  stmts: Stmt[];
}

/**
 * An `if` statement with an optional `else` branch.
 */
export interface If {
  type: "If";
  cond: Expr;
  then: Stmt[];
  else: Stmt[];
}

/**
 * A `while` loop: repeats its body while the condition is truthy.
 */
export interface While {
  type: "While";
  cond: Expr;
  body: Stmt[];
}

/**
 * A `for` loop over a numeric range: `for (name in start..end) body`.
 * The end is exclusive; the loop variable is a fresh number binding
 * visible only inside the body.
 */
export interface For {
  type: "For";
  name: string;
  start: Expr;
  end: Expr;
  body: Stmt[];
}

/**
 * A statement in the program.
 */
export type Stmt = LetDecl | Assign | Return | Block | If | While | For;
