import type { TuffError } from "../errors.ts";
import type {
  ArrayIndexNode,
  AssignNode,
  ForNode,
  IfNode,
  KindName,
  LetNode,
  TuffExpr,
  TuffStatement,
  TypeNode,
  WhileNode,
} from "../ast.ts";
import {
  arrayElementKinds,
  declareBinding,
  findDeclared,
  inferKind,
  literalIndex,
  type DeclaredBinding,
  type ValueKind,
} from "./kinds.ts";
import {
  checkNumberSuffixes,
  checkRangeLiterals,
  findUndeclared,
  resolveDeref,
  resolveIndex,
} from "./expressions.ts";
import { foldStatement } from "./fold.ts";
import { annotationMatch, checkKindName } from "./is-match.ts";

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
 * non-`mut` bindings, and kind mismatches on assignment. On success, folds
 * every `is` type-test into a boolean literal and strips the compile-time
 * `type` alias statements, so the evaluator never sees an `Is` or `Type`
 * node.
 * @param statements - The parsed program statements.
 * @param baseLine - The 1-based line number.
 * @returns The folded program if no semantic error is found, else a TuffError.
 */
export function typecheckProgram(
  statements: TuffStatement[],
  baseLine: number,
): TuffStatement[] | TuffError {
  const scopes: Record<string, DeclaredBinding>[] = [{}];
  const aliases: Record<string, KindName>[] = [{}];
  const error = checkStatements(statements, baseLine, scopes, aliases, false);
  if (error) return error;
  return statements.filter((stmt) => stmt.kind !== "Type");
}

/**
 * Check a list of statements in order.
 * @param statements - The statements to check.
 * @param baseLine - The 1-based line of the first statement.
 * @param scopes - The stack of declared bindings.
 * @param aliases - The stack of declared type aliases.
 * @param inLoop - Whether the statements are inside a loop body.
 * @returns A TuffError if a semantic error is found, else null.
 */
function checkStatements(
  statements: TuffStatement[],
  baseLine: number,
  scopes: Record<string, DeclaredBinding>[],
  aliases: Record<string, KindName>[],
  inLoop: LoopContext,
): TuffError | null {
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (!stmt) continue;
    const error = checkStatement(stmt, baseLine + i, scopes, aliases, inLoop);
    if (error) return error;
  }
  return null;
}

/**
 * Check a single statement.
 * @param stmt - The statement to check.
 * @param line - The 1-based line number.
 * @param scopes - The stack of declared bindings.
 * @param aliases - The stack of declared type aliases.
 * @param inLoop - Whether the statements are inside a loop body.
 * @returns A TuffError if a semantic error is found, else null.
 */
function checkStatement(
  stmt: TuffStatement,
  line: number,
  scopes: Record<string, DeclaredBinding>[],
  aliases: Record<string, KindName>[],
  inLoop: LoopContext,
): TuffError | null {
  const error = checkStatementBody(stmt, line, scopes, aliases, inLoop);
  if (error) return error;
  foldStatement(stmt, scopes, resolveDeref);
  return null;
}

/**
 * Check a single statement's kind, without folding. The caller folds the
 * statement's own expressions once this returns null.
 * @param stmt - The statement to check.
 * @param line - The 1-based line number.
 * @param scopes - The stack of declared bindings.
 * @param aliases - The stack of declared type aliases.
 * @param inLoop - Whether the statements are inside a loop body.
 * @returns A TuffError if a semantic error is found, else null.
 */
function checkStatementBody(
  stmt: TuffStatement,
  line: number,
  scopes: Record<string, DeclaredBinding>[],
  aliases: Record<string, KindName>[],
  inLoop: LoopContext,
): TuffError | null {
  if (stmt.kind === "Block") {
    scopes.push({});
    aliases.push({});
    try {
      return checkStatements(stmt.statements, line, scopes, aliases, inLoop);
    } finally {
      scopes.pop();
      aliases.pop();
    }
  }
  if (stmt.kind === "Let") return checkLet(stmt, line, scopes, aliases);
  if (stmt.kind === "Type") return checkType(stmt, line, aliases);
  if (stmt.kind === "If") return checkIf(stmt, line, scopes, aliases, inLoop);
  if (stmt.kind === "While") return checkWhile(stmt, line, scopes, aliases);
  if (stmt.kind === "For") return checkFor(stmt, line, scopes, aliases);
  if (stmt.kind === "Assign") return checkAssignment(stmt, line, scopes);
  if (stmt.kind === "Return") {
    const error = findUndeclared(stmt.value, line, scopes);
    return error ?? checkNumberSuffixes(stmt.value, line);
  }
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
 * @param aliases - The stack of declared type aliases.
 * @returns A TuffError if a semantic error is found, else null.
 */
function checkLet(
  stmt: LetNode,
  line: number,
  scopes: Record<string, DeclaredBinding>[],
  aliases: Record<string, KindName>[],
): TuffError | null {
  const error = findUndeclared(stmt.value, line, scopes);
  if (error) return error;
  const rangeError = checkRangeLiterals(stmt.value, line, scopes);
  if (rangeError) return rangeError;
  const suffixError = checkNumberSuffixes(stmt.value, line);
  if (suffixError) return suffixError;
  if (stmt.annotation !== undefined) {
    const annotationError = checkAnnotation(
      stmt.annotation,
      stmt.value,
      stmt.name,
      line,
      scopes,
      aliases,
    );
    if (annotationError) return annotationError;
  }
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
    const suffix =
      stmt.value.kind === "Literal" ? stmt.value.suffix : undefined;
    declareBinding(
      stmt.name,
      kind,
      stmt.mut,
      refTo,
      tupleKinds,
      arrayKinds,
      suffix,
      scopes,
    );
  }
  return null;
}

/**
 * Check a `let` declaration's `: KindName` annotation: the kind name must
 * name legal suffixes/kinds, and the initializer must match it.
 * @param annotation - The declared kind name.
 * @param value - The initializer expression.
 * @param name - The binding name, for error reporting.
 * @param line - The 1-based line number.
 * @param scopes - The stack of declared bindings.
 * @param aliases - The stack of declared type aliases.
 * @returns An InvalidNumberSuffix or TypeMismatch error, else null.
 */
function checkAnnotation(
  annotation: KindName,
  value: TuffExpr,
  name: string,
  line: number,
  scopes: Record<string, DeclaredBinding>[],
  aliases: Record<string, KindName>[],
): TuffError | null {
  const resolved = resolveKindName(annotation, aliases);
  const nameError = checkKindName(resolved, line);
  if (nameError) return nameError;
  if (!annotationMatch(value, resolved, scopes, resolveDeref)) {
    return { kind: "TypeMismatch", name, line };
  }
  return null;
}

/**
 * Check a `type` alias declaration: the kind name must name legal
 * suffixes/kinds (with bare names resolved through the alias stack), then
 * register the alias in the innermost scope.
 * @param stmt - The Type statement to check.
 * @param line - The 1-based line number.
 * @param aliases - The stack of declared type aliases.
 * @returns An InvalidNumberSuffix error if a name is illegal, else null.
 */
function checkType(
  stmt: TypeNode,
  line: number,
  aliases: Record<string, KindName>[],
): TuffError | null {
  const resolved = resolveKindName(stmt.alias, aliases);
  const error = checkKindName(resolved, line);
  if (error) return error;
  const scope = aliases[aliases.length - 1];
  if (scope) scope[stmt.name] = resolved;
  return null;
}

/**
 * Resolve the bare names in a kind name through the alias stack, innermost
 * scope first; tuple and array elements are resolved recursively.
 * @param name - The kind name to resolve.
 * @param aliases - The stack of declared type aliases.
 * @returns The kind name with every alias name replaced by its definition.
 */
function resolveKindName(
  name: KindName,
  aliases: Record<string, KindName>[],
): KindName {
  if (name.kind === "KindNameBare") {
    for (let i = aliases.length - 1; i >= 0; i--) {
      const scope = aliases[i];
      const alias = scope?.[name.name];
      if (alias !== undefined) return alias;
    }
    return name;
  }
  if (name.kind === "KindNameTuple") {
    return {
      kind: "KindNameTuple",
      elements: name.elements.map((element) =>
        resolveKindName(element, aliases),
      ),
    };
  }
  if (name.kind === "KindNameArray") {
    return {
      kind: "KindNameArray",
      element: resolveKindName(name.element, aliases),
      length: name.length,
    };
  }
  return name;
}

/**
 * Check a statement in a fresh scope, always popping it afterwards.
 * @param stmt - The statement to check.
 * @param line - The 1-based line number.
 * @param scopes - The stack of declared bindings.
 * @param aliases - The stack of declared type aliases.
 * @param inLoop - Whether the statements are inside a loop body.
 * @returns A TuffError if a semantic error is found, else null.
 */
function checkInScope(
  stmt: TuffStatement,
  line: number,
  scopes: Record<string, DeclaredBinding>[],
  aliases: Record<string, KindName>[],
  inLoop: LoopContext,
): TuffError | null {
  scopes.push({});
  aliases.push({});
  try {
    return checkStatement(stmt, line, scopes, aliases, inLoop);
  } finally {
    scopes.pop();
    aliases.pop();
  }
}

/**
 * Check an `if` statement: its condition, then-branch, and optional else-branch.
 * @param stmt - The If statement to check.
 * @param line - The 1-based line number.
 * @param scopes - The stack of declared bindings.
 * @param aliases - The stack of declared type aliases.
 * @param inLoop - Whether the statements are inside a loop body.
 * @returns A TuffError if a semantic error is found, else null.
 */
function checkIf(
  stmt: IfNode,
  line: number,
  scopes: Record<string, DeclaredBinding>[],
  aliases: Record<string, KindName>[],
  inLoop: LoopContext,
): TuffError | null {
  const condError = findUndeclared(stmt.condition, line, scopes);
  if (condError) return condError;
  const error = checkInScope(stmt.then, line, scopes, aliases, inLoop);
  return (
    error ??
    (stmt.else ? checkInScope(stmt.else, line, scopes, aliases, inLoop) : null)
  );
}

/**
 * Check a `while` statement: its condition and body.
 * @param stmt - The While statement to check.
 * @param line - The 1-based line number.
 * @param scopes - The stack of declared bindings.
 * @param aliases - The stack of declared type aliases.
 * @returns A TuffError if a semantic error is found, else null.
 */
function checkWhile(
  stmt: WhileNode,
  line: number,
  scopes: Record<string, DeclaredBinding>[],
  aliases: Record<string, KindName>[],
): TuffError | null {
  const condError = findUndeclared(stmt.condition, line, scopes);
  return condError ?? checkInScope(stmt.body, line, scopes, aliases, true);
}

/**
 * Check a `for` statement: its range expression, then its body in a fresh
 * scope where the loop variable is declared as a mutable number.
 * @param stmt - The For statement to check.
 * @param line - The 1-based line number.
 * @param scopes - The stack of declared bindings.
 * @param aliases - The stack of declared type aliases.
 * @returns A TuffError if a semantic error is found, else null.
 */
function checkFor(
  stmt: ForNode,
  line: number,
  scopes: Record<string, DeclaredBinding>[],
  aliases: Record<string, KindName>[],
): TuffError | null {
  const rangeError = findUndeclared(stmt.range, line, scopes);
  if (rangeError) return rangeError;
  const rangeKind = inferKind(stmt.range, scopes, resolveDeref);
  if (rangeKind !== null && rangeKind !== "range") {
    return { kind: "TypeMismatch", name: stmt.name, line };
  }
  const boundsError = checkRangeLiterals(stmt.range, line, scopes);
  if (boundsError) return boundsError;
  const suffixError = checkNumberSuffixes(stmt.range, line);
  if (suffixError) return suffixError;
  scopes.push({});
  try {
    declareBinding(
      stmt.name,
      "number",
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      scopes,
    );
    return checkInScope(stmt.body, line, scopes, aliases, true);
  } finally {
    scopes.pop();
  }
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
  } else if (stmt.target.kind === "ArrayIndex") {
    const resolved = resolveIndex(stmt.target, line, scopes);
    if ("kind" in resolved) return resolved;
    name = resolved.name;
    declared = resolved.binding;
  } else {
    return { kind: "InvalidDeref", name: "", line };
  }
  if (!declared.mut) return { kind: "ImmutableAssignment", name, line };
  const valueError = findUndeclared(stmt.value, line, scopes);
  if (valueError) return valueError;
  const rangeError = checkRangeLiterals(stmt.value, line, scopes);
  if (rangeError) return rangeError;
  const suffixError = checkNumberSuffixes(stmt.value, line);
  if (suffixError) return suffixError;
  const expected =
    stmt.target.kind === "ArrayIndex"
      ? elementKind(stmt.target, scopes)
      : declared.kind;
  const kind = inferKind(stmt.value, scopes, resolveDeref);
  if (expected && kind && kind !== expected) {
    return { kind: "TypeMismatch", name, line };
  }
  return null;
}

/**
 * The element kind an array-index assignment must match, or null if the
 * element kind is not statically known.
 * @param target - The ArrayIndex assignment target.
 * @param scopes - The stack of declared bindings.
 * @returns The expected element kind, or null if not statically inferable.
 */
function elementKind(
  target: ArrayIndexNode,
  scopes: Record<string, DeclaredBinding>[],
): ValueKind | null {
  const kinds = arrayElementKinds(target.operand, scopes, resolveDeref);
  if (!kinds) return null;
  const index = literalIndex(target.index);
  return index !== null && index < kinds.length ? (kinds[index] ?? null) : null;
}
