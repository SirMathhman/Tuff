import type { TuffError } from "./errors.ts";
import type {
  AssignNode,
  IfNode,
  LetNode,
  TuffStatement,
  WhileNode,
} from "./ast.ts";
import {
  declareBinding,
  findDeclared,
  inferKind,
  type DeclaredBinding,
} from "./typecheck/kinds.ts";
import { findUndeclared, resolveDeref } from "./typecheck/expressions.ts";

/**
 * Whether the current check position is inside a loop body, so that `break`
 * is valid. Threaded through the statement checkers.
 */
type LoopContext = boolean;

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
 * @returns A TuffError if a semantic error is found, else null.
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
 * @param inLoop - Whether the statements are inside a loop body.
 * @returns A TuffError if a semantic error is found, else null.
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
  const kind = inferKind(stmt.value, scopes, resolveDeref);
  if (kind) {
    const refTo =
      stmt.value.kind === "Ref" && stmt.value.operand.kind === "Identifier"
        ? stmt.value.operand.name
        : undefined;
    const tupleKinds =
      stmt.value.kind === "Tuple"
        ? stmt.value.elements.map(
            (element) => inferKind(element, scopes, resolveDeref) ?? "number",
          )
        : undefined;
    const arrayKinds =
      stmt.value.kind === "Array"
        ? stmt.value.elements.map(
            (element) => inferKind(element, scopes, resolveDeref) ?? "number",
          )
        : undefined;
    declareBinding(
      stmt.name,
      kind,
      stmt.mut,
      refTo,
      tupleKinds,
      arrayKinds,
      scopes,
    );
  }
  return null;
}

/**
 * Check a statement in a fresh scope, always popping it afterwards.
 * @param stmt - The statement to check.
 * @param line - The 1-based line number.
 * @param scopes - The stack of declared bindings.
 * @param inLoop - Whether the statements are inside a loop body.
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
 * @param inLoop - Whether the statements are inside a loop body.
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
  return (
    error ?? (stmt.else ? checkInScope(stmt.else, line, scopes, inLoop) : null)
  );
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
  const kind = inferKind(stmt.value, scopes, resolveDeref);
  if (kind && kind !== declared.kind) {
    return { kind: "TypeMismatch", name, line };
  }
  return null;
}
