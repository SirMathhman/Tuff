import type { Bracket } from "./errors";
import type { Operator } from "./scanner";

/**
 * The kinds of entry the parser keeps on its operator stack.
 */
export enum EntryKind {
  /** A pending binary operator. */
  Operator = "operator",
  /** An open bracket. */
  Group = "group",
  /** A let or assignment in progress. */
  Binding = "binding",
  /** An if expression in progress. */
  If = "if",
}

/**
 * The outcome of one parser step: keep going, or stop at the end of the input.
 */
export enum Step {
  /** Keep parsing. */
  Continue = "continue",
  /** Stop: the input is complete. */
  End = "end",
}

/**
 * The phases of an `if` expression, in order.
 */
export enum IfPhase {
  /** Reading the parenthesized condition. */
  Condition = "condition",
  /** Parsing the then-branch. */
  Then = "then",
  /** Waiting for else. */
  AwaitElse = "awaitElse",
  /** Parsing the else-branch. */
  Else = "else",
}

/**
 * A value is an integer or a boolean. A boolean has no arithmetic meaning.
 */
export type Value = number | boolean;

/**
 * A pending binary operator, with the offset where it was written.
 */
export interface OperatorEntry {
  /** Discriminates this entry as an operator. */
  kind: EntryKind.Operator;
  /** The binary operator. */
  operator: Operator;
  /** Offset of the operator. */
  where: number;
}

/**
 * An open bracket, remembering its kind, the sign written before it, and its offset.
 */
export interface GroupEntry {
  /** Discriminates this entry as an open bracket. */
  kind: EntryKind.Group;
  /** The kind of bracket. */
  bracket: Bracket;
  /** The sign written directly before the bracket: 1 or -1. */
  sign: number;
  /** Offset of the bracket. */
  where: number;
  /** Whether this bracket opens the condition of an if. */
  ifCondition: boolean;
}

/**
 * A `let` or assignment whose value is still being evaluated; ends at ";".
 */
export interface BindingEntry {
  /** Discriminates this entry as a binding. */
  kind: EntryKind.Binding;
  /** The variable name. */
  name: string;
  /** Whether the variable was declared with let mut. */
  mutable: boolean;
  /** Whether this is a reassignment rather than a declaration. */
  assign: boolean;
  /** Offset of the variable name. */
  where: number;
  /** The variable a `let` reference points to, once `&name` is read. */
  target?: Cell;
  /** Whether the reference is a `&mut` one. */
  exclusive?: boolean;
}

/**
 * An `if` expression in progress.
 */
export interface IfEntry {
  /** Discriminates this entry as an if expression. */
  kind: EntryKind.If;
  /** The phase the if is in. */
  phase: IfPhase;
  /** The sign written before the if. */
  sign: number;
  /** Offset of the if keyword. */
  where: number;
  /** The value of the condition, once known. */
  condition: boolean;
  /** Whether the current branch is unchosen and only parsed. */
  skipping: boolean;
  /** The value of the chosen branch, once known. */
  value: Value | undefined;
}

/**
 * Any entry on the operator stack.
 */
export type StackEntry = OperatorEntry | GroupEntry | BindingEntry | IfEntry;

/**
 * A variable: its value, and whether it was declared with `let mut`.
 */
export interface Cell {
  /** The current value. */
  value: Value;
  /** Whether the variable may be reassigned. */
  mutable: boolean;
  /** For a reference, the variable it points to; its value is unused. */
  target?: Cell;
  /** For a reference, whether it is a `&mut` one. */
  exclusive?: boolean;
}

/**
 * The variables declared in one block.
 */
export type Scope = Map<string, Cell>;

/**
 * The parser's complete state between steps.
 */
/**
 * Where the parser stands among statements.
 */
export interface StatementFlags {
  /** Whether the parser is at the start of a statement. */
  atStatementStart: boolean;
  /** Whether the last top-level statement was a let or assignment. */
  afterLet: boolean; // the last top-level statement was a `let` or an assignment
  /** Whether the most recent item was a statement. */
  lastStatementEnded: boolean; // the most recent item was a statement, not an expression
}

/**
 * The parser's complete state between steps.
 */
export interface ParserState {
  /** The program text being parsed. */
  source: string;
  /** The current offset in source. */
  pos: number;
  /** The value stack. */
  values: Value[];
  /** The operator stack. */
  ops: StackEntry[];
  /** The stack of block scopes, innermost last. */
  scopes: Scope[];
  /** Number of open brackets. */
  depth: number; // number of open brackets
  /** Number of unchosen if branches being parsed. */
  skipDepth: number; // number of unchosen `if` branches being parsed
  /** Whether the next token must be an operand. */
  expectOperand: boolean;
  /** Statement-level flags. */
  flags: StatementFlags;
}
