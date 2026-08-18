import { isIdentifier } from "./tokenize.js";
import type { Binding, Parser } from "./parser.js";

/**
 * Parses a dereference expression `*identifier`. The target must be a
 * reference binding; otherwise an invalid-dereference error is recorded.
 * Returns the current value of the referenced variable.
 */
export function parseDereference(parser: Parser): number | null {
  parser.advance(); // "*"
  const name = parser.peek();
  if (name === undefined || !isIdentifier(name)) {
    return null;
  }
  parser.advance();
  const binding = parser.lookup(name);
  if (binding === null) {
    parser.error = { kind: "unknown-variable", name };
    return null;
  }
  if (binding.kind !== "ref") {
    parser.error = { kind: "invalid-dereference", name };
    return null;
  }
  return binding.target.value;
}

/**
 * Parses a reference initializer `&identifier` or `&mut identifier`.
 * The target must be a known value binding; `&mut` additionally requires
 * the target to be a `mut` binding. Returns a reference binding that
 * points directly at the target binding object.
 */
export function parseReferenceBinding(parser: Parser): Binding | null {
  parser.advance(); // "&"
  let mutable = false;
  if (parser.peek() === "mut") {
    parser.advance();
    mutable = true;
  }
  const name = parser.peek();
  if (name === undefined || !isIdentifier(name)) {
    return null;
  }
  parser.advance();
  const binding = parser.lookup(name);
  if (binding === null) {
    parser.error = { kind: "unknown-variable", name };
    return null;
  }
  if (binding.kind === "ref") {
    return null;
  }
  if (mutable && !binding.mutable) {
    parser.error = { kind: "immutable-assignment", name };
    return null;
  }
  return { kind: "ref", target: binding, mutable };
}

/**
 * Parses `*identifier = expression ;`. The target must be a mutable
 * reference binding; the write is applied to the referenced variable.
 */
export function parseDereferenceAssignment(parser: Parser): boolean {
  parser.advance(); // "*"
  const name = parser.advance() as string; // identifier (guaranteed by isAssignmentStart)
  const rhs = parser.parseAssignmentRhs();
  if (rhs === null) {
    return false;
  }
  const binding = parser.lookupOrError(name);
  if (binding === null) {
    return false;
  }
  if (binding.kind !== "ref") {
    parser.error = { kind: "invalid-dereference", name };
    return false;
  }
  if (!parser.checkTypeMismatch(name, binding.target, rhs.literal)) {
    return false;
  }
  if (!binding.mutable) {
    parser.error = { kind: "immutable-assignment", name };
    return false;
  }
  binding.target.value = rhs.value;
  return true;
}
