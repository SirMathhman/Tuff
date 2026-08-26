import type { TuffError } from "./errors.ts";
import type { AssignNode, TuffExpr, TuffStatement } from "./ast.ts";

/** A declared binding's type, mutability, and reference target. */
interface DeclaredBinding {
  /** The kind of value the binding holds. */
  kind: "number" | "bool";
  /** Whether the binding was declared with `mut`. */
  mut: boolean;
  /** The name of the binding this is a reference to, if a `&`/`&mut`. */
  refTo?: string;
}

/** A successfully resolved dereference target. */
interface ResolvedDeref {
  /** The binding the dereference reads or writes. */
  binding: DeclaredBinding;
  /** The name of the referenced binding. */
  name: string;
}

/**
 * Statically check a parsed program for semantic errors.
 * Walks every statement, including unreachable branches, tracking the kind,
 * mutability, and reference target each binding is declared with. Catches
 * undeclared identifiers, invalid references and dereferences, assignments to
 * non-`mut` bindings, and kind mismatches on assignment.
 * @param statements - The parsed program statements.
 * @param baseLine - The 1-based line of the first statement.
 * @returns A TuffError if a semantic error is found, else null.
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
    const error = findUndeclared(stmt.value, line, scopes);
    if (error) return error;
    const kind = inferKind(stmt.value, scopes);
    if (kind) {
      const refTo =
        stmt.value.kind === "Ref" && stmt.value.operand.kind === "Identifier"
          ? stmt.value.operand.name
          : undefined;
      declareBinding(stmt.name, kind, stmt.mut, refTo, scopes);
    }
    return null;
  }
  if (stmt.kind === "If") {
    const condError = findUndeclared(stmt.condition, line, scopes);
    if (condError) return condError;
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
  if (stmt.kind === "Return") {
    return findUndeclared(stmt.value, line, scopes);
  }
  return null;
}

/**
 * Check an assignment statement against the target binding's declaration.
 * Handles both identifier targets and dereference targets.
 * @param stmt - The assignment statement to check.
 * @param line - The 1-based line number.
 * @param scopes - The stack of declared bindings.
 * @returns A TuffError if a semantic error is found, else null.
 */
function checkAssignment(
  stmt: AssignNode,
  line: number,
  scopes: Record<string, DeclaredBinding>[],
): TuffError | null {
  let name: string;
  let declared: DeclaredBinding;
  if (stmt.target.kind === "Identifier") {
    name = stmt.target.name;
    const found = findDeclared(scopes, name);
    if (!found) {
      return { kind: "UnidentifiedIdentifier", name, line };
    }
    declared = found;
  } else if (stmt.target.kind === "Deref") {
    const resolved = resolveDeref(stmt.target.operand, line, scopes);
    if ("kind" in resolved) return resolved;
    name = resolved.name;
    declared = resolved.binding;
  } else {
    return { kind: "InvalidDeref", name: "", line };
  }
  if (!declared.mut) {
    return { kind: "ImmutableAssignment", name, line };
  }
  const valueError = findUndeclared(stmt.value, line, scopes);
  if (valueError) return valueError;
  const kind = inferKind(stmt.value, scopes);
  if (kind && kind !== declared.kind) {
    return { kind: "TypeMismatch", name, line };
  }
  return null;
}

/**
 * Infer the value kind of an expression, or null if not statically inferable.
 * @param expr - The expression to inspect.
 * @param scopes - The stack of declared bindings.
 * @returns "number" or "bool" if inferable, else null.
 */
function inferKind(
  expr: TuffExpr,
  scopes: Record<string, DeclaredBinding>[],
): "number" | "bool" | null {
  if (expr.kind === "Literal") {
    return expr.value.kind === "bool" ? "bool" : "number";
  }
  if (expr.kind === "Identifier") {
    return findDeclared(scopes, expr.name)?.kind ?? null;
  }
  if (expr.kind === "Add") return "number";
  if (
    expr.kind === "Equal" ||
    expr.kind === "Less" ||
    expr.kind === "And" ||
    expr.kind === "Or"
  ) {
    return "bool";
  }
  if (expr.kind === "Ref") return "number";
  if (expr.kind === "Deref") {
    const resolved = resolveDeref(expr.operand, 0, scopes);
    return "kind" in resolved ? null : resolved.binding.kind;
  }
  return null;
}

/**
 * Find an undeclared identifier, an invalid reference, or an invalid `&mut`
 * in an expression.
 * @param expr - The expression to inspect.
 * @param line - The 1-based line number.
 * @param scopes - The stack of declared bindings.
 * @returns An UnidentifiedIdentifier, InvalidReference, InvalidDeref, or
 * ImmutableAssignment error if one is found, else null.
 */
function findUndeclared(
  expr: TuffExpr,
  line: number,
  scopes: Record<string, DeclaredBinding>[],
): TuffError | null {
  if (expr.kind === "Identifier") {
    if (!findDeclared(scopes, expr.name)) {
      return { kind: "UnidentifiedIdentifier", name: expr.name, line };
    }
    return null;
  }
  if (
    expr.kind === "Or" ||
    expr.kind === "And" ||
    expr.kind === "Add" ||
    expr.kind === "Equal" ||
    expr.kind === "Less"
  ) {
    const left = findUndeclared(expr.left, line, scopes);
    if (left) return left;
    return findUndeclared(expr.right, line, scopes);
  }
  if (expr.kind === "Ref") {
    if (expr.operand.kind !== "Identifier") {
      return { kind: "InvalidReference", name: "", line };
    }
    const declared = findDeclared(scopes, expr.operand.name);
    if (!declared) {
      return { kind: "UnidentifiedIdentifier", name: expr.operand.name, line };
    }
    if (expr.mut && !declared.mut) {
      return { kind: "ImmutableAssignment", name: expr.operand.name, line };
    }
    return null;
  }
  if (expr.kind === "Deref") {
    const resolved = resolveDeref(expr.operand, line, scopes);
    if ("kind" in resolved) return resolved;
    return null;
  }
  return null;
}

/**
 * Resolve a dereference operand to the binding it references.
 * @param operand - The operand expression of the dereference.
 * @param line - The 1-based line number.
 * @param scopes - The stack of declared bindings.
 * @returns The referenced binding and name, or a TuffError.
 */
function resolveDeref(
  operand: TuffExpr,
  line: number,
  scopes: Record<string, DeclaredBinding>[],
): ResolvedDeref | TuffError {
  if (operand.kind !== "Identifier") {
    return { kind: "InvalidDeref", name: "", line };
  }
  const declared = findDeclared(scopes, operand.name);
  if (!declared) {
    return { kind: "UnidentifiedIdentifier", name: operand.name, line };
  }
  if (!declared.refTo) {
    return { kind: "InvalidDeref", name: operand.name, line };
  }
  const referenced = findDeclared(scopes, declared.refTo);
  if (!referenced) {
    return { kind: "UnidentifiedIdentifier", name: declared.refTo, line };
  }
  return { binding: referenced, name: declared.refTo };
}

/**
 * Declare a binding in the innermost scope.
 * @param name - The binding name.
 * @param kind - The value kind.
 * @param mut - Whether the binding is mutable.
 * @param refTo - The name of the binding this is a reference to, if any.
 * @param scopes - The stack of declared bindings.
 */
function declareBinding(
  name: string,
  kind: "number" | "bool",
  mut: boolean,
  refTo: string | undefined,
  scopes: Record<string, DeclaredBinding>[],
): void {
  const scope = scopes[scopes.length - 1];
  if (scope) scope[name] = { kind, mut, refTo };
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
