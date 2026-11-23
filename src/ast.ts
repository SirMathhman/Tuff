import { type ErrorWhere } from "./errors.ts";

interface NumberNode {
  kind: "number";
  value: number;
}

interface BooleanNode {
  kind: "boolean";
  value: boolean;
}

interface StringNode {
  kind: "string";
  value: string;
}

interface NegateNode {
  kind: "negate";
  operand: Expr;
  where: ErrorWhere;
}

interface ReferenceNode {
  kind: "reference";
  name: string;
  where: ErrorWhere;
}

export type CompareOp = "<" | "<=" | ">" | ">=" | "==" | "!=";

interface CompareNode {
  kind: "compare";
  op: CompareOp;
  left: Expr;
  right: Expr;
  where: ErrorWhere;
}

interface IfNode {
  kind: "if";
  condition: Expr;
  then: Expr;
  otherwise: Expr;
  where: ErrorWhere;
}

/**
 * One operator and its right-hand operand in a chain.
 */
export interface Link {
  /** The operator applied to the running value. */
  op: "+" | "-" | "*";
  /** The right-hand operand. */
  operand: Expr;
  /** Where the operator appears in the token list. */
  where: ErrorWhere;
}

interface ChainNode {
  kind: "chain";
  first: Expr;
  links: Link[];
}

interface LetStatement {
  kind: "let";
  name: string;
  mutable: boolean;
  value: Expr;
  where: ErrorWhere;
}

interface RefNode {
  kind: "ref";
  name: string;
  mutable: boolean;
  where: ErrorWhere;
}

interface DerefNode {
  kind: "deref";
  operand: Expr;
  where: ErrorWhere;
}

interface DerefAssignStatement {
  kind: "derefAssign";
  name: string;
  value: Expr;
  where: ErrorWhere;
}

/**
 * An assignment to a name that an enclosing let statement declared.
 */
export interface AssignStatement {
  /** The statement kind. */
  kind: "assign";
  /** The name being assigned. */
  name: string;
  /** The expression whose value replaces the name's value. */
  value: Expr;
  /** Where the assigned name appears in the token list. */
  where: ErrorWhere;
}

interface ScopeStatement {
  kind: "scope";
  statements: Statement[];
}

interface BranchStatement {
  kind: "branch";
  condition: Expr;
  then: Statement[];
  otherwise: Statement[];
  where: ErrorWhere;
}

/**
 * A statement inside a block body: a let declaration, an assignment, or a statement block.
 */
interface ElementStatement {
  kind: "element";
  name: string;
  index: Expr;
  value: Expr;
  where: ErrorWhere;
}

export type Statement =
  | LetStatement
  | AssignStatement
  | ScopeStatement
  | BranchStatement
  | ElementStatement
  | DerefAssignStatement;

interface BlockNode {
  kind: "block";
  statements: Statement[];
  result: Expr;
}

/**
 * A parsed expression: a number, a boolean, a name, a negation, a chain of operators, an if, or a block.
 */
export type LogicalOp = "&&" | "||";

interface LogicalNode {
  kind: "logical";
  op: LogicalOp;
  left: Expr;
  right: Expr;
  where: ErrorWhere;
}

interface NotNode {
  kind: "not";
  operand: Expr;
  where: ErrorWhere;
}

interface ArrayNode {
  kind: "array";
  elements: Expr[];
  where: ErrorWhere;
}

interface IndexNode {
  kind: "index";
  target: Expr;
  index: Expr;
  where: ErrorWhere;
}

export type Expr =
  | ArrayNode
  | IndexNode
  | RefNode
  | DerefNode
  | NumberNode
  | BooleanNode
  | StringNode
  | NegateNode
  | ReferenceNode
  | ChainNode
  | IfNode
  | CompareNode
  | LogicalNode
  | NotNode
  | BlockNode;
