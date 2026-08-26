import type { TuffError } from "./errors.ts";
import type {
  AssignNode,
  IfNode,
  LetNode,
  TuffExpr,
  TuffStatement,
  TupleIndexNode,
  TupleNode,
  WhileNode,
} from "./ast.ts";

/**
 * Whether the current check position is inside a loop body, so that `break`
 * is valid. Threaded through the statement checkers.
 */
type LoopContext = boolean;

/** A declared binding's type, mutability, and reference target. */
interface DeclaredBinding {
  /** The kind of value the binding holds. */
  kind: "number" | "bool" | "tuple";
  /** Whether the binding was declared with `mut`. */
  mut: boolean;
  /** The name of the binding this is a reference to, if a `&`/`&mut`. */
  refTo?: string;
  /** The element kinds, if the binding holds a tuple literal. */
  tupleKinds?: Array<"number" | "bool" | "tuple">;
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
  return checkStatements(statements, baseLine, scopes, false);
}

/**
 * Check a list of statements in order.
 * @param statements - The statements to check.
 * @param baseLine - The 1-based line of the first statement.
 * @param scopes - The stack of declared bindings.
 * @param inLoop - Whether the statements are inside a loop body.
 * @returns A TypeMismatch error if a mismatch is found, else null.
 */
function checkStatements(
  statements: TuffStatement[],
  baseLine: number,
  scopes: Record<string, DeclaredBinding>[],
  inLoop: LoopContext,
): TuffError | null {
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (!stmt) continue;
    const error = checkStatement(stmt, baseLine + i, scopes, inLoop);
    if (error) return error;
  }
  return null;
}

/**
 * Check a single statement.
 * @param stmt - The statement to check.
 * @param line - The 1-based line number.
 * @param scopes - The stack of declared bindings.
 * @param inLoop - Whether the statement is inside a loop body.
 * @returns A TypeMismatch error if a mismatch is found, else null.
 */
function checkStatement(
  stmt: TuffStatement,
  line: number,
  scopes: Record<string, DeclaredBinding>[],
  inLoop: LoopContext,
): TuffError | null {
  if (stmt.kind === "Block") {
    scopes.push({});
    try {
      return checkStatements(stmt.statements, line, scopes, inLoop);
    } finally {
      scopes.pop();
    }
  }
  if (stmt.kind === "Let") return checkLet(stmt, line, scopes);
  if (stmt.kind === "If") return checkIf(stmt, line, scopes, inLoop);
  if (stmt.kind === "While") return checkWhile(stmt, line, scopes);
  if (stmt.kind === "Assign") return checkAssignment(stmt, line, scopes);
  if (stmt.kind === "Return") return findUndeclared(stmt.value, line, scopes);
  if (stmt.kind === "Break")
    return inLoop ? null : { kind: "BreakOutsideLoop", line };
  if (stmt.kind === "Continue")
    return inLoop ? null : { kind: "ContinueOutsideLoop", line };
  return null;
}

/**
 * Check a `let` declaration: its initializer, then declare the binding.
 * @param stmt - The Let statement to check.
 * @param line - The 1-based line number.
 * @param scopes - The stack of declared bindings.
 * @returns A TuffError if a semantic error is found, else null.
 */
function checkLet(
  stmt: LetNode,
  line: number,
  scopes: Record<string, DeclaredBinding>[],
): TuffError | null {
  const error = findUndeclared(stmt.value, line, scopes);
  if (error) return error;
  const kind = inferKind(stmt.value, scopes);
  if (kind) {
    const refTo =
      stmt.value.kind === "Ref" && stmt.value.operand.kind === "Identifier"
        ? stmt.value.operand.name
        : undefined;
    const tupleKinds =
      stmt.value.kind === "Tuple"
        ? stmt.value.elements.map((element) => inferKind(element, scopes) ?? "number")
        : undefined;
    declareBinding(stmt.name, kind, stmt.mut, refTo, tupleKinds, scopes);
  }
  return null;
}

/**
 * Check a statement in a fresh scope, always popping it afterwards.
 * @param stmt - The statement to check.
 * @param line - The 1-based line number.
 * @param scopes - The stack of declared bindings.
 * @param inLoop - Whether the statement is inside a loop body.
 * @returns A TuffError if a semantic error is found, else null.
 */
function checkInScope(
  stmt: TuffStatement,
  line: number,
  scopes: Record<string, DeclaredBinding>[],
  inLoop: LoopContext,
): TuffError | null {
  scopes.push({});
  try {
    return checkStatement(stmt, line, scopes, inLoop);
  } finally {
    scopes.pop();
  }
}

/**
 * Check an `if` statement: its condition, then-branch, and optional else-branch.
 * @param stmt - The If statement to check.
 * @param line - The 1-based line number.
 * @param scopes - The stack of declared bindings.
 * @param inLoop - Whether the statement is inside a loop body.
 * @returns A TuffError if a semantic error is found, else null.
 */
function checkIf(
  stmt: IfNode,
  line: number,
  scopes: Record<string, DeclaredBinding>[],
  inLoop: LoopContext,
): TuffError | null {
  const condError = findUndeclared(stmt.condition, line, scopes);
  if (condError) return condError;
  const error = checkInScope(stmt.then, line, scopes, inLoop);
  return error ?? (stmt.else ? checkInScope(stmt.else, line, scopes, inLoop) : null);
}

/**
 * Check a `while` statement: its condition and body.
 * @param stmt - The While statement to check.
 * @param line - The 1-based line number.
 * @param scopes - The stack of declared bindings.
 * @returns A TuffError if a semantic error is found, else null.
 */
function checkWhile(
  stmt: WhileNode,
  line: number,
  scopes: Record<string, DeclaredBinding>[],
): TuffError | null {
  const condError = findUndeclared(stmt.condition, line, scopes);
  return condError ?? checkInScope(stmt.body, line, scopes, true);
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
    if (!found) return { kind: "UnidentifiedIdentifier", name, line };
    declared = found;
  } else if (stmt.target.kind === "Deref") {
    const resolved = resolveDeref(stmt.target.operand, line, scopes);
    if ("kind" in resolved) return resolved;
    name = resolved.name;
    declared = resolved.binding;
  } else {
    return { kind: "InvalidDeref", name: "", line };
  }
  if (!declared.mut) return { kind: "ImmutableAssignment", name, line };
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
): "number" | "bool" | "tuple" | null {
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
  )
    return "bool";
  if (expr.kind === "Ref") return "number";
  if (expr.kind === "Deref") {
    const resolved = resolveDeref(expr.operand, 0, scopes);
    return "kind" in resolved ? null : resolved.binding.kind;
  }
  if (expr.kind === "Tuple") return "tuple";
  if (expr.kind === "TupleIndex") {
    const kinds = tupleElementKinds(expr.operand, scopes);
    return kinds ? (kinds[expr.index] ?? null) : null;
  }
  return null;
}

/**
 * The element kinds of a tuple expression, or null if not statically a tuple.
 * @param expr - The expression to inspect.
 * @param scopes - The stack of declared bindings.
 * @returns {Array<"number" | "bool" | "tuple"> | null} The element kinds, or null.
 */
function tupleElementKinds(
  expr: TuffExpr,
  scopes: Record<string, DeclaredBinding>[],
): Array<"number" | "bool" | "tuple"> | null {
  if (expr.kind === "Tuple") {
    return expr.elements.map((element) => inferKind(element, scopes) ?? "number");
  }
  if (expr.kind === "Identifier") {
    return findDeclared(scopes, expr.name)?.tupleKinds ?? null;
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
    return left ?? findUndeclared(expr.right, line, scopes);
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
  if (expr.kind === "Tuple" || expr.kind === "TupleIndex") {
    return checkTupleExpr(expr, line, scopes);
  }
  return null;
}

/**
 * Check a tuple or tuple-index expression for undeclared identifiers and
 * out-of-bounds indices.
 * @param expr - The tuple or tuple-index expression to check.
 * @param line - The 1-based line number.
 * @param scopes - The stack of declared bindings.
 * @returns An UnidentifiedIdentifier or InvalidTupleIndex error, else null.
 */
function checkTupleExpr(
  expr: TupleNode | TupleIndexNode,
  line: number,
  scopes: Record<string, DeclaredBinding>[],
): TuffError | null {
  if (expr.kind === "Tuple") {
    for (const element of expr.elements) {
      const error = findUndeclared(element, line, scopes);
      if (error) return error;
    }
    return null;
  }
  const error = findUndeclared(expr.operand, line, scopes);
  if (error) return error;
  const kinds = tupleElementKinds(expr.operand, scopes);
  if (kinds && expr.index >= kinds.length) {
    const name = expr.operand.kind === "Identifier" ? expr.operand.name : "";
    return { kind: "InvalidTupleIndex", name, index: expr.index, line };
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
 * @param tupleKinds - The element kinds, if the binding holds a tuple.
 * @param scopes - The stack of declared bindings.
 */
function declareBinding(
  name: string,
  kind: "number" | "bool" | "tuple",
  mut: boolean,
  refTo: string | undefined,
  tupleKinds: Array<"number" | "bool" | "tuple"> | undefined,
  scopes: Record<string, DeclaredBinding>[],
): void {
  const scope = scopes[scopes.length - 1];
  if (scope) scope[name] = { kind, mut, refTo, tupleKinds };
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
