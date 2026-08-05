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

/** Assignment expression (e.g. `x = 1`) */
export interface AssignExprNode {
  type: "assign";
  name: string;
  valueExpr: Expr;
}

/** Expression union — any valid expression in the language */
export type Expr = BinOpNode | NumberNode | VarRefNode | BlockNode | AssignExprNode;

// --- Statements (side-effecting constructs that live inside blocks) ---

/** Let declaration (`let x = expr;` or `let mut x = expr;`) */
export interface LetDeclStmt {
  type: "letdecl";
  name: string;
  valueExpr: Expr;
  mutable?: boolean;
}

/** Expression used as a statement (e.g. `x` on its own line) */
export interface ExprStmt {
  type: "exprstmt";
  expr: Expr;
}

/** Statement union — only appears inside blocks */
export type Stmt = LetDeclStmt | ExprStmt;

/** Block `{ stmts }` — evaluates to last statement's result */
export interface BlockNode {
  type: "block";
  statements: Stmt[];
}

// --- Scope (lexical scoping) ---

/** Lexical scope with parent chain for variable lookups */
export class Scope {
  private bindings: Map<string, number>;
  private mutableBindings: Set<string>;
  private parent: Scope | null;

  constructor(parent?: Scope) {
    this.bindings = new Map();
    this.mutableBindings = new Set();
    this.parent = parent ?? null;
  }

  set(name: string, value: number): void {
    this.bindings.set(name, value);
  }

  get(name: string): number | undefined {
    return this.bindings.get(name) ?? this.parent?.get(name);
  }

  declareMutable(name: string): void {
    this.mutableBindings.add(name);
  }

  isMutable(name: string): boolean {
    return this.mutableBindings.has(name) || (this.parent?.isMutable(name) ?? false);
  }
}
