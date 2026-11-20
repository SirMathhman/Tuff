/**
 * Types shared by the Tuff parser: values, bindings, scopes, and parse state.
 */
import type { Problem } from "./tuff-lexing";

/**
 * A value of a Tuff expression: a number, a boolean from "true" or "false", or a reference.
 * Values of different types are never equal.
 */
export type Value = number | boolean | Reference;
/**
 * A reference made with "&name" or "&mut name". Reading it with "*" gives the target's
 * current value; only a mutable reference can be assigned through with "*name = ...".
 */
export interface Reference {
  /**
   * The variable the reference points to.
   */
  readonly target: Binding;
  /**
   * True if the reference was made with "&mut".
   */
  readonly mutable: boolean;
}
/**
 * A variable's current value and whether it may be reassigned.
 */
export interface Binding {
  /**
   * The variable's current value.
   */
  value: Value;
  /**
   * True if the variable was declared with "let mut" and may be assigned.
   */
  readonly mutable: boolean;
  /**
   * Nesting depth of the scope that declares the variable; the program's scope is 0.
   */
  readonly depth: number;
  /** The integer type declared for the variable, such as "U8"; undefined if the variable is untyped. */
  readonly type?: string;
}
/**
 * A set of variables introduced by one block, linked to the enclosing block.
 */
export interface Scope {
  /**
   * Variables declared directly in this block.
   */
  readonly vars: Map<string, Binding>;
  /**
   * The enclosing scope, or undefined for the program's outermost scope.
   */
  readonly parent?: Scope;
  /**
   * Nesting depth of this scope; the program's scope is 0.
   */
  readonly depth: number;
  /** Functions declared directly in this scope. */
  readonly functions: Map<string, FunctionDef>;
}
/** A function declared with "fn". Its body is re-parsed from text on each call. */
export interface FunctionDef {
  /** Parameter names, in order. */
  readonly paramNames: readonly string[];
  /** Offset where the body expression starts. */
  readonly bodyStart: number;
  /** Offset of the ";" that ends the body. */
  readonly bodyEnd: number;
  /** The scope the function was declared in. */
  readonly scope: Scope;
}
/**
 * Mutable read position shared by the parsing functions.
 */
export interface Cursor {
  /**
   * Zero-based offset of the next unread character.
   */
  pos: number;
  /**
   * The innermost scope whose variables are visible at the current position.
   */
  scope: Scope;
  /**
   * True inside a branch of "if" that is not taken: it is checked but its assignments do not run.
   */
  dead: boolean;
  /**
   * True inside a loop body, where "break" is allowed.
   */
  breakable: boolean;
  /**
   * Set when a "break" has run in the current loop iteration; later statements then take no effect.
   */
  exit?: LoopExit;
  /** Number of function calls currently being evaluated. */
  callDepth: number;
}
/**
 * The value a "break" produced, which ends the enclosing loop.
 */
export interface LoopExit {
  /**
   * The value given to "break".
   */
  readonly value: Value;
}
/**
 * A variable found by name in the source.
 */
export interface NamedVariable {
  /**
   * The variable's name.
   */
  readonly name: string;
  /**
   * Offset of the variable's name in the source.
   */
  readonly start: number;
  /**
   * The variable's binding.
   */
  readonly binding: Binding;
}
/**
 * Outcome of trying to parse one statement: either no statement starts here, or one was
 * parsed, possibly with a problem.
 */
export type StatementStep = NoStatement | ParsedStatement;
/**
 * Outcome when no statement starts at the cursor.
 */
export interface NoStatement {
  /**
   * Always false for this outcome.
   */
  readonly matched: false;
}
/**
 * Outcome when a statement was parsed.
 */
export interface ParsedStatement {
  /**
   * Always true for this outcome.
   */
  readonly matched: true;
  /**
   * The first problem found in the statement, or undefined if it parsed.
   */
  readonly problem?: Problem;
}
