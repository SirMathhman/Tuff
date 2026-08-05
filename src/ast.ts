/** Binary operation node (+, -, *, /) */
export interface BinOpNode {
  type: "binop";
  op: "+" | "-" | "*" | "/";
  left: Expr;
  right: Expr;
}

/** Literal number node */
export interface NumberNode {
  type: "number";
  value: number;
}

/** Expression union — any valid expression in the language */
export type Expr = BinOpNode | NumberNode;
