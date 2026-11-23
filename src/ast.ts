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
  annotation?: Annotation;
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

/** A scalar annotation: a sized integer type, or Bool. */
export type ScalarAnnotation = IntType | "Bool";

/**
 * An array annotation such as [Bool; 3]: every element has the element type, and there are exactly length elements.
 */
export interface ArrayAnnotation {
  /** The discriminant: always "array". */
  kind: "array";
  /** The type every element must have. */
  element: ScalarAnnotation;
  /** The number of elements the array must have. */
  length: number;
}

/**
 * A struct name used as a type, such as the Point in let p : Point = Point { x : 1, y : 2 };.
 */
export interface StructAnnotation {
  /** The discriminant: always "struct". */
  kind: "struct";
  /** The struct name. */
  name: string;
}

/**
 * A function type such as &(I32, I32) => I32: the scalar types of its parameters and its scalar result.
 */
export interface FunctionAnnotation {
  /** The discriminant: always "function". */
  kind: "function";
  /** The type of each parameter, in order. */
  params: ScalarAnnotation[];
  /** The type of the result. */
  returns: ScalarAnnotation;
}

/** The type a let annotation names. */
export type Annotation =
  ScalarAnnotation | ArrayAnnotation | StructAnnotation | FunctionAnnotation;

/**
 * One field of a struct declaration, with a scalar or array type.
 */
export interface StructField {
  /** The field name. */
  name: string;
  /** True when the declaration marks the field mut, so a mut binding may assign it. */
  mutable: boolean;
  /** The type every value of this field must have. */
  annotation: ScalarAnnotation | ArrayAnnotation;
}

/**
 * A struct declaration: a name and its fields.
 */
export interface StructDecl {
  /** The struct name. */
  name: string;
  /** The fields in declaration order. */
  fields: StructField[];
}

// A loop that runs its body while its boolean condition holds.
interface WhileStatement {
  kind: "while";
  condition: Expr;
  body: Statement[];
  where: ErrorWhere;
}

/**
 * One named field of a record literal.
 */
export interface RecordField {
  /** The field name. */
  name: string;
  /** The expression whose value the field holds. */
  value: Expr;
}

/**
 * A record literal such as { x : 3, y : 4 }.
 */
interface RecordNode {
  /** The statement kind. */
  kind: "record";
  /** The fields in source order. */
  fields: RecordField[];
  /** Where the record literal opens. */
  where: ErrorWhere;
}

// A struct constructor, such as Point { x : 3, y : 4 }: a struct name and one value for each field.
interface ConstructNode {
  kind: "construct";
  name: string;
  fields: RecordField[];
  where: ErrorWhere;
}

/**
 * A read of one field, as in pt.x.
 */
interface FieldNode {
  /** The expression kind. */
  kind: "field";
  /** The record expression whose field is read. */
  target: Expr;
  /** The field name. */
  name: string;
  /** Where the dot appears. */
  where: ErrorWhere;
}

/**
 * An assignment to one field of a mut record, as in pt.x = 5;.
 */
export interface FieldAssignStatement {
  /** The statement kind. */
  kind: "fieldAssign";
  /** The name of the record binding. */
  name: string;
  /** The field being assigned. */
  field: string;
  /** The expression whose value replaces the field. */
  value: Expr;
  /** Where the record name appears. */
  where: ErrorWhere;
}

export type Statement =
  | LetStatement
  | AssignStatement
  | ScopeStatement
  | BranchStatement
  | ElementStatement
  | DerefAssignStatement
  | WhileStatement
  | FieldAssignStatement;

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
export const INT_TYPES = [
  "U8",
  "U16",
  "U32",
  "U64",
  "I8",
  "I16",
  "I32",
  "I64",
] as const;

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

/**
 * One parameter of a function: a name and the scalar type its argument must have.
 */
export interface FunctionParam {
  /** The parameter name. */
  name: string;
  /** The type every argument for this parameter must have. */
  annotation: ScalarAnnotation | FunctionAnnotation;
}

/**
 * A function declaration, such as fn add(first : I32, second : I32) : I32 => first + second;.
 */
export interface FunctionDecl {
  /** The function name. */
  name: string;
  /** The parameters in declaration order. */
  params: FunctionParam[];
  /** The type the body's value must have. */
  returns: ScalarAnnotation;
  /** The expression computed by a call. */
  body: Expr;
}

// A call of a declared function, such as add(3I32, 4I32).
interface CallNode {
  kind: "call";
  name: string;
  args: Expr[];
  where: ErrorWhere;
}

export type Expr =
  | CallNode
  | ArrayNode
  | IndexNode
  | RecordNode
  | ConstructNode
  | FieldNode
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
