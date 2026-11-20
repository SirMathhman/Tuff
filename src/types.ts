/**
 * Types shared by the Tuff parser: values, bindings, scopes, and parse state.
 */
import type { Problem } from "./parse/lexing";

/**
 * A value of a Tuff expression: a number, a boolean from "true" or "false", a reference, or an array.
 * Values of different types are never equal.
 */
export type Value = number | boolean | Reference | ArrayValue | StructValue;
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
 * A struct value, built with "Name { field : value, ... }" and read with "value.field".
 */
export interface StructValue {
  /**
   * The name of the struct type this value was built from.
   */
  readonly structName: string;
  /**
   * The field values, keyed by field name, in declaration order.
   */
  readonly fields: ReadonlyMap<string, Value>;
}
/**
 * A struct declared with "struct". Each field has a declared type.
 */
export interface StructDef {
  /**
   * The declared type of each field, keyed by field name, in declaration order.
   */
  readonly fields: ReadonlyMap<string, string>;
}
/**
 * An array made with "[a, b, c]". Its elements all have the same kind, and it is read with "name[index]".
 */
export interface ArrayValue {
  /**
   * The elements, in order.
   */
  readonly elements: readonly Value[];
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
  /** Type aliases declared directly in this scope, mapping each name to the type it stands for. */
  readonly types: Map<string, string>;
  /** Structs declared directly in this scope. */
  readonly structs: Map<string, StructDef>;
}
/** A value the host supplies to a Tuff program: a number, a boolean, or a function. */
export type HostValue = number | boolean | HostFunction;
/**
 * A function the host supplies to a Tuff program: it takes numbers and booleans and returns one of them.
 */
export type HostFunction = (...args: (number | boolean)[]) => number | boolean;
/** A parameter of a function declared with "fn". */
export interface Param {
  /** The parameter's name. */
  readonly name: string;
  /** The declared type, such as "I32". Every parameter must have one. */
  readonly type: string;
}
/** A function declared with "fn". Its body is re-parsed from text on each call. */
export interface FunctionDef {
  /** Parameters, in order. */
  readonly params: readonly Param[];
  /** Declared return type, such as "I32"; undefined if the function has none. */
  readonly returnType?: string;
  /** Offset where the body expression starts; unused when the function is external. */
  readonly bodyStart: number;
  /** Offset of the ";" that ends the body; unused when the function is external. */
  readonly bodyEnd: number;
  /** The scope the function was declared in. */
  readonly scope: Scope;
  /** True if the function was declared with "in fn" and its body is supplied by the host. */
  readonly external: boolean;
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
  /** The functions the host supplies, keyed by name. */
  readonly hostValues: ReadonlyMap<string, HostValue>;
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
