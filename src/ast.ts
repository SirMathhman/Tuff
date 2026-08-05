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

/** Variable reference (e.g. `x`) */
export interface VarRefNode {
  type: "varref";
  name: string;
}

/** Let declaration (`let x = expr;`) — part of a block's statements */
export interface LetDeclNode {
  type: "letdecl";
  name: string;
  value: Expr;
}

/** Block `{ stmts }` — evaluates to last statement's result */
export interface BlockNode {
  type: "block";
  statements: (Expr | LetDeclNode)[];
}

/** Statement union — can appear inside blocks */
export type Stmt = Expr | LetDeclNode;

/** Expression union — any valid expression in the language */
export type Expr = BinOpNode | NumberNode | VarRefNode | BlockNode;
