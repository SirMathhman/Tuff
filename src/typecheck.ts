import type { TuffError } from "./errors.ts";
import type { AssignNode, TuffExpr, TuffStatement } from "./ast.ts";

/** A declared binding's type and mutability, tracked by the type checker. */
interface DeclaredBinding {
  /** The kind of value the binding holds. */
  kind: "number" | "bool";
  /** Whether the binding was declared with `mut`. */
  mut: boolean;
}

/**
 * Statically check a parsed program for assignment errors.
 * Walks every statement, including unreachable branches, tracking the kind
 * and mutability each binding is declared with. Assigning to a non-`mut`
 * binding is an ImmutableAssignment error; assigning a literal of a
 * different kind to a declared binding is a TypeMismatch error.
 * @param statements - The parsed program statements.
 * @param baseLine - The 1-based line of the first statement.
 * @returns A TypeMismatch error if a mismatch is found, else null.
 */
export function typecheckProgram(
  statements: TuffStatement[],
  baseLine: number,
): TuffError | null {
  const scopes: Record<string, DeclaredBinding>[] = [{}];
  return checkStatements(statements, baseLine, scopes);
}

/**
 * Check a list of statements in order.
 * @param statements - The statements to check.
 * @param baseLine - The 1-based line of the first statement.
 * @param scopes - The stack of declared bindings.
 * @returns A TypeMismatch error if a mismatch is found, else null.
 */
function checkStatements(
  statements: TuffStatement[],
  baseLine: number,
  scopes: Record<string, DeclaredBinding>[],
): TuffError | null {
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (!stmt) continue;
    const error = checkStatement(stmt, baseLine + i, scopes);
    if (error) return error;
  }
  return null;
}

/**
 * Check a single statement.
 * @param stmt - The statement to check.
 * @param line - The 1-based line number.
 * @param scopes - The stack of declared bindings.
 * @returns A TypeMismatch error if a mismatch is found, else null.
 */
function checkStatement(
  stmt: TuffStatement,
  line: number,
  scopes: Record<string, DeclaredBinding>[],
): TuffError | null {
  if (stmt.kind === "Block") {
    scopes.push({});
    try {
      return checkStatements(stmt.statements, line, scopes);
    } finally {
      scopes.pop();
    }
  }
  if (stmt.kind === "Let") {
    const kind = literalKind(stmt.value);
    if (kind) declareBinding(stmt.name, kind, stmt.mut, scopes);
    return null;
  }
  if (stmt.kind === "If") {
    scopes.push({});
    let error = checkStatement(stmt.then, line, scopes);
    scopes.pop();
    if (error) return error;
    if (stmt.else) {
      scopes.push({});
      error = checkStatement(stmt.else, line, scopes);
      scopes.pop();
    }
    return error;
  }
  if (stmt.kind === "Assign") {
    return checkAssignment(stmt, line, scopes);
  }
  return null;
}

/**
 * Check an assignment statement against the target binding's declaration.
 * @param stmt - The assignment statement to check.
 * @param line - The 1-based line number.
 * @param scopes - The stack of declared bindings.
 * @returns An UnidentifiedIdentifier, ImmutableAssignment, or TypeMismatch
 * error if one is found, else null.
 */
function checkAssignment(
  stmt: AssignNode,
  line: number,
  scopes: Record<string, DeclaredBinding>[],
): TuffError | null {
  if (stmt.target.kind !== "Identifier") return null;
  const declared = findDeclared(scopes, stmt.target.name);
  if (!declared) {
    return { kind: "UnidentifiedIdentifier", name: stmt.target.name, line };
  }
  if (!declared.mut) {
    return { kind: "ImmutableAssignment", name: stmt.target.name, line };
  }
  const kind = literalKind(stmt.value);
  if (!kind) return null;
  if (kind !== declared.kind) {
    return { kind: "TypeMismatch", name: stmt.target.name, line };
  }
  return null;
}

/**
 * Get the value kind of a literal expression, or null if not a literal.
 * @param expr - The expression to inspect.
 * @returns "number" or "bool" for literals, else null.
 */
function literalKind(expr: TuffExpr): "number" | "bool" | null {
  if (expr.kind !== "Literal") return null;
  return expr.value.kind === "bool" ? "bool" : "number";
}

/**
 * Declare a binding in the innermost scope.
 * @param name - The binding name.
 * @param kind - The value kind.
 * @param mut - Whether the binding is mutable.
 * @param scopes - The stack of declared bindings.
 */
function declareBinding(
  name: string,
  kind: "number" | "bool",
  mut: boolean,
  scopes: Record<string, DeclaredBinding>[],
): void {
  const scope = scopes[scopes.length - 1];
  if (scope) scope[name] = { kind, mut };
}

/**
 * Find a declared binding, innermost scope first.
 * @param scopes - The stack of declared bindings.
 * @param name - The binding name.
 * @returns The declared binding, or null if not found.
 */
function findDeclared(
  scopes: Record<string, DeclaredBinding>[],
  name: string,
): DeclaredBinding | null {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const scope = scopes[i];
    if (scope && scope[name]) return scope[name];
  }
  return null;
}
