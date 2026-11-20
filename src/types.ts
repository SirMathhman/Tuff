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
  /** A function call whose body is being parsed. */
  Call = "call",
  /** A while loop in progress. */
  Loop = "loop",
  /** A match expression in progress. */
  Match = "match",
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
 * A reference yielded by a block or if-branch, to be bound by the enclosing let.
 */
export interface BindingRef {
  /** The variable the reference points to. */
  target: Cell;
  /** Whether the reference is a `&mut` one. */
  exclusive: boolean;
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
  /** A reference that is the block's final value, if any. */
  ref?: BindingRef;
  /** A top-level block opened at a statement start, whose value is discarded if it ends in a statement. */
  statementStart?: boolean;
  /** The body of a statement-level if without else; a body ending in a statement is checked when an else is seen. */
  discardable?: boolean;
  /** The part of a while loop or match this bracket opens, if any. */
  part?: GroupPart;
  /** Whether the block's value is discarded because it ends in an assignment. */
  discardValue?: boolean;
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
  /** The operator of a compound assignment such as `+=`, if any. */
  operator?: Operator;
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
  /** Whether the if stands alone at a top-level statement start. */
  statement?: boolean;
  /** Offset of the then-branch's closing brace, when that branch ends in a statement. */
  bodyEnd?: number;
  /** A reference yielded by the chosen branch, if any. */
  ref?: BindingRef;
}

/**
 * Any entry on the operator stack.
 */
export type StackEntry =
  | OperatorEntry
  | GroupEntry
  | BindingEntry
  | IfEntry
  | CallEntry
  | LoopEntry
  | MatchEntry;

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
  /** For a function, its body and the variables visible where it was declared. */
  func?: FuncDef;
}

/**
 * The variables declared in one block.
 */
export type Scope = Map<string, Cell>;

/**
 * A declared function: the span of its body, and the scopes visible at its declaration.
 */
export interface FuncDef {
  /** Offset of the first character of the body. */
  start: number;
  /** Offset of the ';' that ends the body. */
  end: number;
  /** The scopes visible at the declaration, innermost last, as they were then. */
  scopes: Scope[];
  /** The same scopes, live, so functions declared later in them are found. */
  live: Scope[];
  /** The order in which the function was declared. */
  seq: number;
}

/**
 * The saved parser flags of a caller, restored when a check or call finishes.
 */
export interface Resume {
  /** Whether the next token must be an operand. */
  expectOperand: boolean;
  /** Whether the parser was at a statement start. */
  atStatementStart: boolean;
  /** Whether the last item was a statement. */
  lastStatementEnded: boolean;
  /** Whether the last statement was an assignment. */
  lastAssign: boolean;
  /** Whether the last top-level statement was a let or assignment. */
  afterLet: boolean;
}

/**
 * A function body whose check waits until its block ends.
 */
export interface PendingCheck {
  /** The scope stack the function was declared in. */
  owner: Scope[];
  /** The depth of that stack at the declaration. */
  depth: number;
  /** The function to check. */
  func: FuncDef;
  /** Offset of the function's name. */
  where: number;
}

/**
 * The parts of a while loop or match that a bracket can open.
 */
export enum GroupPart {
  /** The parenthesized condition of a while loop. */
  LoopCondition = "loopCondition",
  /** The braced body of a while loop. */
  LoopBody = "loopBody",
  /** The parenthesized value of a match. */
  MatchScrutinee = "matchScrutinee",
  /** The braced cases of a match. */
  MatchBody = "matchBody",
}

/**
 * A while loop in progress: its condition and body, and where it ends.
 */
export interface LoopEntry {
  /** Discriminates this entry as a loop. */
  kind: EntryKind.Loop;
  /** Offset of the `while` keyword. */
  where: number;
  /** Offset of the condition's opening parenthesis. */
  condStart: number;
  /** Offset of the body's opening brace. */
  bodyStart: number;
  /** Offset just past the body's closing brace. */
  end: number;
  /** Whether the body runs once without iterating, because the condition was false or the loop is unchosen. */
  once: boolean;
  /** Whether the body is parsed in lenient mode, counted in the skip depth. */
  counted: boolean;
}

/**
 * A match expression in progress: its scrutinee, and which case has been chosen.
 */
export interface MatchEntry {
  /** Discriminates this entry as a match. */
  kind: EntryKind.Match;
  /** Offset of the `match` keyword. */
  where: number;
  /** The sign written before the match. */
  sign: number;
  /** Offset of the scrutinee's opening parenthesis. */
  parenStart: number;
  /** Offset of the cases' opening brace. */
  bodyStart: number;
  /** The value being matched, once the scrutinee is read. */
  scrutinee: Value | undefined;
  /** Whether a case's value is being parsed. */
  armOpen: boolean;
  /** Whether the open case is skipped, because an earlier case was chosen or the match is unchosen. */
  skipping: boolean;
  /** Whether a case has been chosen. */
  chosen: boolean;
  /** The value of the chosen case. */
  result: Value | undefined;
}

/**
 * What a call entry stands for: an expression, a statement, or a deferred check.
 */
export enum CallMode {
  /** A call used as a value. */
  Expression = "expression",
  /** A call that starts a statement, so a following ';' discards its value. */
  Statement = "statement",
  /** A deferred check of a declaration's body, whose value is discarded. */
  Check = "check",
}

/**
 * A function call whose body is being parsed; the caller's state is saved here.
 */
export interface CallEntry {
  /** Discriminates this entry as a function call. */
  kind: EntryKind.Call;
  /** The sign written before the call. */
  sign: number;
  /** Offset of the call's name. */
  where: number;
  /** Offset just past the call's closing parenthesis. */
  returnPos: number;
  /** Offset of the ';' that ends the body. */
  end: number;
  /** The caller's scopes, restored when the call finishes. */
  scopes: Scope[];
  /** The caller's bracket depth, restored when the call finishes. */
  depth: number;
  /** The value-stack height when the call started; the body's value sits above it. */
  base: number;
  /** What this entry stands for. */
  mode: CallMode;
  /** The caller's flags, restored when a check or call finishes. */
  resume: Resume;
}

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
  /** Whether the most recent statement was an assignment rather than a let. */
  lastAssign: boolean;
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
  /** Function declarations so far, and the checks still waiting for their block to end. */
  functions: FunctionRegistry;
}

/**
 * Function declarations seen so far, and the checks not yet run.
 */
export interface FunctionRegistry {
  /** How many functions have been declared. */
  declared: number;
  /** Function bodies whose checks wait for their block to end. */
  pending: PendingCheck[];
}
