/**
 * Scope lookup and small value helpers for the Tuff parser. Nothing here parses text.
 */
import { type Value, type Binding, type Scope, type FunctionDef, type Cursor, type LoopExit } from "./tuff-types";
import { findTopLevel, type Problem } from "./tuff-lexing";
import { ok, err, type Result } from "./result";

/**
 * Finds the value of a variable in the given scope or the scopes enclosing it.
 *
 * @param scope - The innermost scope to search first.
 * @param name - The variable name to look up.
 * @returns The binding of the nearest declaration of the name, or undefined if none is in scope.
 */
export function lookup(scope: Scope, name: string): Binding | undefined {
  for (let current: Scope | undefined = scope; current !== undefined; current = current.parent) {
    const { vars } = current;
    const binding = vars.get(name);
    if (binding !== undefined) {
      return binding;
    }
  }
  return undefined;
}
/**
 * Finds a function declared in the given scope or the scopes enclosing it.
 *
 * @param scope - The innermost scope to search first.
 * @param name - The function name to look up.
 * @returns The nearest declaration of the name, or undefined if none is in scope.
 */
export function lookupFunction(scope: Scope, name: string): FunctionDef | undefined {
  for (let current: Scope | undefined = scope; current !== undefined; current = current.parent) {
    const { functions } = current;
    const found = functions.get(name);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}
/**
 * Creates an empty scope nested in the given parent, or the program's outermost scope if there is none.
 *
 * @param parent - The enclosing scope, or undefined for the outermost scope.
 * @returns The new scope.
 */
export function newScope(parent?: Scope): Scope {
  return { vars: new Map(), functions: new Map(), parent, depth: parent === undefined ? 0 : parent.depth + 1 };
}
/**
 * Returns the offset of the ";" that ends a function body, or -1 if there is none. Only scans
 * characters, so nothing is parsed or evaluated.
 *
 * @param text - The source being parsed.
 * @param start - Offset where the body starts.
 * @returns The offset of the ending ";", or -1.
 */
export function findFunctionBodyEnd(text: string, start: number): number {
  return findTopLevel(text, start, (character) => character === ";");
}
/**
 * Reports whether a value is a reference to a variable declared deeper than the given depth,
 * so that storing it at that depth would let it outlive its variable.
 *
 * @param value - The value being stored or returned.
 * @param depth - The depth of the scope that will hold the value.
 * @returns True if the value is a reference that would outlive its target.
 */
export function escapes(value: Value, depth: number): boolean {
  if (typeof value !== "object") {
    return false;
  }
  const { target } = value;
  return target.depth > depth;
}
/**
 * Describes the kind of a value for error messages.
 *
 * @param value - The value to describe.
 * @returns "a number", "a boolean", or "a reference".
 */
export function kindOf(value: Value): string {
  if (typeof value === "number") {
    return "a number";
  }
  return typeof value === "boolean" ? "a boolean" : "a reference";
}
/**
 * Reports whether assignments must take no effect: inside a dead branch, or after a "break"
 * has run in the current loop iteration.
 *
 * @param cursor - The current parse state.
 * @returns True if effects are suppressed.
 */
export function isSuppressed(cursor: Cursor): boolean {
  return cursor.dead || cursor.exit !== undefined;
}
/**
 * Returns the exit set by a "break" and clears it, so the next loop iteration starts fresh.
 *
 * @param cursor - The parse state.
 * @returns The exit, or undefined if no break ran.
 */
export function takeExit(cursor: Cursor): LoopExit | undefined {
  const exit = cursor.exit;
  cursor.exit = undefined;
  return exit;
}

/**
 * Reports whether a name is an integer type: U8, U16, U32, U64, I8, I16, I32 or I64.
 *
 * @param typeName - The name to check.
 * @returns True if the name is an integer type.
 */
export function isIntegerType(typeName: string): boolean {
  return /^[UI](8|16|32|64)$/.test(typeName);
}

/**
 * Reports whether an integer fits an integer type. An unknown type name fits nothing.
 *
 * @param value - The integer to check.
 * @param typeName - An integer type name such as "U8" or "I32".
 * @returns True if the value is within the type's range.
 */
export function fitsIntegerType(value: bigint, typeName: string): boolean {
  const match = /^([UI])(8|16|32|64)$/.exec(typeName);
  if (match === null) {
    return false;
  }
  const [, sign = "", bits = ""] = match;
  const width = BigInt(bits);
  const unsigned = sign === "U";
  const min = unsigned ? 0n : -(2n ** (width - 1n));
  const max = unsigned ? 2n ** width - 1n : 2n ** (width - 1n) - 1n;
  return value >= min && value <= max;
}

/**
 * Message for a value that would make a reference outlive the variable it points to.
 */
export const OUTLIVES_MESSAGE = "a value that does not refer to a variable declared inside a deeper block";
/**
 * Checks that a value may be stored in a variable: it must have the variable's type, and
 * a reference must not outlive the variable it points to.
 *
 * @param value - The value to store.
 * @param offset - Offset of the value's first character, for error reporting.
 * @param target - The variable that will receive the value.
 * @param description - How the variable is named in the error message.
 * @returns The problem found, or undefined if the value may be stored.
 */
export function checkStore(value: Value, offset: number, target: Binding, description: string): Problem | undefined {
  if (typeof value !== typeof target.value) {
    return { offset, expected: `${kindOf(target.value)} to match the type of ${description}` };
  }
  if (typeof value === "number" && target.type !== undefined && !fitsIntegerType(BigInt(value), target.type)) {
    return { offset, expected: `a value that fits in ${target.type}` };
  }
  if (escapes(value, target.depth)) {
    return { offset, expected: OUTLIVES_MESSAGE };
  }
  return undefined;
}
/**
 * Checks a value before a declaration stores it. A typed declaration needs a number that fits
 * the type, and a reference must not outlive the scope of the new variable.
 *
 * @param value - The value being stored.
 * @param offset - Offset of the value's first character, for error reporting.
 * @param depth - Depth of the scope the variable is declared in.
 * @param type - The declared integer type, or undefined if the declaration is untyped.
 * @returns The problem found, or undefined if the value may be stored.
 */
export function checkDeclaration(value: Value, offset: number, depth: number, type?: string): Problem | undefined {
  if (type !== undefined) {
    if (typeof value !== "number") {
      return { offset, expected: `a number for ${type}` };
    }
    if (!fitsIntegerType(BigInt(value), type)) {
      return { offset, expected: `a value that fits in ${type}` };
    }
  }
  return escapes(value, depth) ? { offset, expected: OUTLIVES_MESSAGE } : undefined;
}
/**
 * Applies a compound-assignment operator to two numbers.
 *
 * @param op - The operator: "+", "-" or "*".
 * @param left - The variable's current value.
 * @param right - The value of the right-hand side.
 * @returns The result to store back in the variable.
 */
export function applyCompound(op: string, left: number, right: number): number {
  if (op === "+") {
    return left + right;
  }
  if (op === "-") {
    return left - right;
  }
  return left * right;
}
/**
 * Compares two values with "==". They must have the same type. References are compared by the
 * values they point to, which must also have the same type.
 *
 * @param left - The left-hand value.
 * @param right - The right-hand value.
 * @param offset - Offset of the operator, for error reporting.
 * @returns An Ok result with whether the values are equal, or an Err result with the first problem found.
 */
export function valuesEqual(left: Value, right: Value, offset: number): Result<boolean, Problem> {
  if (typeof left !== typeof right) {
    return err({ offset, expected: `a value of the same type as the left side of "=="` });
  }
  if (typeof left === "object" && typeof right === "object") {
    const { target: leftTarget } = left;
    const { target: rightTarget } = right;
    const leftPointee = leftTarget.value;
    const rightPointee = rightTarget.value;
    if (typeof leftPointee !== typeof rightPointee) {
      return err({ offset, expected: `references to values of the same type on each side of "=="` });
    }
    return ok(leftPointee === rightPointee);
  }
  return ok(left === right);
}
