import type { Bracket } from "./errors";
import type { Operator } from "./scanner";

/**
 * The kinds of entry the parser keeps on its operator stack.
 */
export enum EntryKind {
  Operator = "operator",
  Group = "group",
  Binding = "binding",
  If = "if",
}

/**
 * The outcome of one parser step: keep going, or stop at the end of the input.
 */
export enum Step {
  Continue = "continue",
  End = "end",
}

/**
 * The phases of an `if` expression, in order.
 */
export enum IfPhase {
  Condition = "condition",
  Then = "then",
  AwaitElse = "awaitElse",
  Else = "else",
}

/**
 * A value is an integer or a boolean. A boolean has no arithmetic meaning.
 */
export type Value = number | boolean;

/**
 * A pending binary operator, with the offset where it was written.
 */
interface OperatorEntry {
  kind: EntryKind.Operator;
  operator: Operator;
  where: number;
}

/**
 * An open bracket, remembering its kind, the sign written before it, and its offset.
 */
export interface GroupEntry {
  kind: EntryKind.Group;
  bracket: Bracket;
  sign: number;
  where: number;
  ifCondition: boolean;
}

/**
 * A `let` or assignment whose value is still being evaluated; ends at ";".
 */
export interface BindingEntry {
  kind: EntryKind.Binding;
  name: string;
  mutable: boolean;
  assign: boolean;
  where: number;
}

/**
 * An `if` expression in progress.
 */
export interface IfEntry {
  kind: EntryKind.If;
  phase: IfPhase;
  sign: number;
  where: number;
  condition: boolean;
  skipping: boolean;
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
  value: Value;
  mutable: boolean;
}

/**
 * The variables declared in one block.
 */
export type Scope = Map<string, Cell>;

/**
 * The parser's complete state between steps.
 */
export interface ParserState {
  source: string;
  pos: number;
  values: Value[];
  ops: StackEntry[];
  scopes: Scope[];
  depth: number; // number of open brackets
  skipDepth: number; // number of unchosen `if` branches being parsed
  expectOperand: boolean;
  atStatementStart: boolean;
  afterLet: boolean; // the last top-level statement was a `let` or an assignment
  lastStatementEnded: boolean; // the most recent item was a statement, not an expression
}
