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
  op: "+" | "-" | "*" | "/" | "|" | "&" | "<<" | ">>";
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
  annotation ?: IntType;
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

// A loop that runs its body while its boolean condition holds.
interface WhileStatement {
  kind: "while";
  condition: Expr;
  body: Statement[];
  where: ErrorWhere;
}

export type Statement =
  | LetStatement
  | AssignStatement
  | ScopeStatement
  | BranchStatement
  | ElementStatement
  | DerefAssignStatement
  | WhileStatement;

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

/** The sized integer types. A literal's suffix is its type name, such as 100U8 or -5I32. */
export const INT_TYPES = ["U8", "U16", "U32", "U64", "I8", "I16", "I32", "I64"] as const;

/**
 * A sized integer type's name.
 */
export type IntType = (typeof INT_TYPES)[number];

/**
 * The smallest and largest value of a sized integer type.
 */
export interface IntRange {
  /** The smallest value the type holds. */
  min: bigint;
  /** The largest value the type holds. */
  max: bigint;
}

/** The range of every sized integer type. */
export const INT_RANGES: Record<IntType, IntRange> = {
  U8: { min: 0n, max: 255n },
  U16: { min: 0n, max: 65535n },
  U32: { min: 0n, max: 4294967295n },
  U64: { min: 0n, max: 18446744073709551615n },
  I8: { min: -128n, max: 127n },
  I16: { min: -32768n, max: 32767n },
  I32: { min: -2147483648n, max: 2147483647n },
  I64: { min: -9223372036854775808n, max: 9223372036854775807n },
};

// A sized integer literal, such as 100U64 or -128I8. Its value is already within its type's range.
interface IntNode {
  kind: "int";
  type: IntType;
  value: bigint;
}

export type Expr =
  | ArrayNode
  | IndexNode
  | RefNode
  | DerefNode
  | NumberNode
  | IntNode
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
