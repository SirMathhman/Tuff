import type { TuffError } from "../errors.ts";
import type {
  ArrayIndexNode,
  AssignNode,
  BlockExprNode,
  ForNode,
  IfNode,
  KindName,
  LetNode,
  StructNode,
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
  kindValueKind,
  literalIndex,
  resolveKindName,
  structFieldKinds,
  type BlockExprCheck,
  type CheckContext,
  type DeclaredBinding,
  type ExprCheckContext,
  type StructDef,
  type ValueKind,
} from "./kinds.ts";
import {
  checkNumberSuffixes,
  checkRangeLiterals,
  exprContext,
  findUndeclared,
  resolveDeref,
  resolveIndex,
} from "./expressions.ts";
import { foldStatement } from "./fold.ts";
import { checkFn } from "./fn.ts";
import { annotationMatch, checkKindName, exprSuffix } from "./is-match.ts";
import { checkReservedName } from "./reserved.ts";

/**
 * Statically check a parsed program for semantic errors.
 * Walks every statement, including unreachable branches, tracking the kind,
 * mutability, and reference target each binding is declared with. Catches
 * undeclared identifiers, invalid references and dereferences, assignments to
 * non-`mut` bindings, and kind mismatches on assignment. On success, folds
 * every `is` type-test into a boolean literal and strips the compile-time
 * `type` alias and `struct` statements, so the evaluator never sees an `Is`
 * or `Type` node.
 * @param statements - The parsed program statements.
 * @param baseLine - The 1-based line number.
 * @returns The folded program if no semantic error is found, else a TuffError.
 */
export function typecheckProgram(
  statements: TuffStatement[],
  baseLine: number,
): TuffStatement[] | TuffError {
  const context: CheckContext = {
    scopes: [{}],
    aliases: [{}],
    structs: [{}],
    fns: [{}],
    inLoop: false,
    checkBlockExpr,
  };
  const error = checkStatements(statements, baseLine, context);
  if (error) return error;
  return statements.filter(
    (stmt) => stmt.kind !== "Type" && stmt.kind !== "Struct",
  );
}

/**
 * Check a list of statements in order.
 * @param statements - The statements to check.
 * @param baseLine - The 1-based line of the first statement.
 * @param context - The mutable check context.
 * @returns A TuffError if a semantic error is found, else null.
 */
function checkStatements(
  statements: TuffStatement[],
  baseLine: number,
  context: CheckContext,
): TuffError | null {
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (!stmt) continue;
    const error = checkStatement(stmt, baseLine + i, context);
    if (error) return error;
  }
  return null;
}

/**
 * Check a single statement.
 * @param stmt - The statement to check.
 * @param line - The 1-based line number.
 * @param context - The mutable check context.
 * @returns A TuffError if a semantic error is found, else null.
 */
function checkStatement(
  stmt: TuffStatement,
  line: number,
  context: CheckContext,
): TuffError | null {
  const error = checkStatementBody(stmt, line, context);
  if (error) return error;
  foldStatement(stmt, exprContext(context));
  return null;
}

/**
 * Check a single statement's kind, without folding. The caller folds the
 * statement's own expressions once this returns null.
 * @param stmt - The statement to check.
 * @param line - The 1-based line number.
 * @param context - The mutable check context.
 * @returns A TuffError if a semantic error is found, else null.
 */
function checkStatementBody(
  stmt: TuffStatement,
  line: number,
  context: CheckContext,
): TuffError | null {
  if (stmt.kind === "Block") {
    return inFreshScope(context, () =>
      checkStatements(stmt.statements, line, context),
    );
  }
  if (stmt.kind === "Let") return checkLet(stmt, line, context);
  if (stmt.kind === "Type") return checkType(stmt, line, context.aliases);
  if (stmt.kind === "Struct")
    return checkStruct(stmt, line, context.aliases, context.structs);
  if (stmt.kind === "Fn") return checkFn(stmt, line, context, checkStatement);
  if (stmt.kind === "If") return checkIf(stmt, line, context);
  if (stmt.kind === "While") return checkWhile(stmt, line, context);
  if (stmt.kind === "For") return checkFor(stmt, line, context);
  if (stmt.kind === "Assign") return checkAssignment(stmt, line, context);
  if (stmt.kind === "Return") {
    const error = findUndeclared(stmt.value, line, exprContext(context));
    return error ?? checkNumberSuffixes(stmt.value, line);
  }
  if (stmt.kind === "Break")
    return context.inLoop ? null : { kind: "BreakOutsideLoop", line };
  if (stmt.kind === "Continue")
    return context.inLoop ? null : { kind: "ContinueOutsideLoop", line };
  return null;
}

/**
 * Check a `let` declaration: its initializer, then declare the binding.
 * @param stmt - The Let statement to check.
 * @param line - The 1-based line number.
 * @param context - The mutable check context.
 * @returns A TuffError if a semantic error is found, else null.
 */
function checkLet(
  stmt: LetNode,
  line: number,
  context: CheckContext,
): TuffError | null {
  const scopes = context.scopes;
  const exprCtx = exprContext(context);
  const reservedError = checkReservedName(stmt.name, line);
  if (reservedError) return reservedError;
  const error = findUndeclared(stmt.value, line, exprCtx);
  if (error) return error;
  const rangeError = checkRangeLiterals(stmt.value, line, exprCtx);
  if (rangeError) return rangeError;
  const suffixError = checkNumberSuffixes(stmt.value, line);
  if (suffixError) return suffixError;
  if (stmt.annotation !== undefined) {
    const annotationError = checkAnnotation(
      stmt.annotation,
      stmt.value,
      stmt.name,
      line,
      context,
    );
    if (annotationError) return annotationError;
  }
  const kind = inferKind(stmt.value, exprCtx);
  if (kind) {
    const refTo =
      stmt.value.kind === "Ref" && stmt.value.operand.kind === "Identifier"
        ? stmt.value.operand.name
        : undefined;
    const tupleKinds =
      stmt.value.kind === "Tuple"
        ? stmt.value.elements.map(
            (element) => inferKind(element, exprCtx) ?? "number",
          )
        : undefined;
    const arrayKinds =
      stmt.value.kind === "Array"
        ? stmt.value.elements.map(
            (element) => inferKind(element, exprCtx) ?? "number",
          )
        : undefined;
    const structKinds =
      stmt.value.kind === "StructLiteral"
        ? (structFieldKinds(stmt.value, exprCtx) ?? undefined)
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
      structKinds,
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
 * @param context - The mutable check context.
 * @returns An InvalidNumberSuffix or TypeMismatch error, else null.
 */
function checkAnnotation(
  annotation: KindName,
  value: TuffExpr,
  name: string,
  line: number,
  context: CheckContext,
): TuffError | null {
  const resolved = resolveKindName(annotation, context.aliases);
  const nameError = checkKindName(resolved, line, context.structs);
  if (nameError) return nameError;
  if (!annotationMatch(value, resolved, exprContext(context))) {
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
 * @returns An InvalidNumberSuffix error if a name is illegal, else null.d
 */
function checkType(
  stmt: TypeNode,
  line: number,
  aliases: Record<string, KindName>[],
): TuffError | null {
  const reservedError = checkReservedName(stmt.name, line);
  if (reservedError) return reservedError;
  const resolved = resolveKindName(stmt.alias, aliases);
  const error = checkKindName(resolved, line);
  if (error) return error;
  const scope = aliases[aliases.length - 1];
  if (scope) scope[stmt.name] = resolved;
  return null;
}

/**
 * Check a `struct` declaration: each field's kind name must name legal
 * suffixes/kinds (with bare names resolved through the alias stack), then
 * register the struct's field kinds in the innermost scope.
 * @param stmt - The Struct statement to check.
 * @param line - The 1-based line number.
 * @param aliases - The stack of declared type aliases.
 * @param structs - The stack of declared structs.
 * @returns An InvalidNumberSuffix error if a field name is illegal, else null.
 */
function checkStruct(
  stmt: StructNode,
  line: number,
  aliases: Record<string, KindName>[],
  structs: Record<string, StructDef>[],
): TuffError | null {
  const reservedError = checkReservedName(stmt.name, line);
  if (reservedError) return reservedError;
  const fields: Record<string, ValueKind> = {};
  for (const field of stmt.fields) {
    const resolved = resolveKindName(field.type, aliases);
    const error = checkKindName(resolved, line, structs);
    if (error) return error;
    fields[field.name] = kindValueKind(resolved);
  }
  const scope = structs[structs.length - 1];
  if (scope) scope[stmt.name] = { fields };
  return null;
}

/**
 * Check a statement in a fresh scope, always popping it afterwards.
 * @param stmt - The statement to check.
 * @param line - The 1-based line number.
 * @param context - The mutable check context.
 * @returns A TuffError if a semantic error is found, else null.
 */
function checkInScope(
  stmt: TuffStatement,
  line: number,
  context: CheckContext,
): TuffError | null {
  return inFreshScope(context, () => checkStatement(stmt, line, context));
}

/**
 * Run a check in a fresh scope, always popping it afterwards. Every scope
 * stack the context carries is pushed and popped together, mirroring the
 * evaluator's scope semantics.
 * @param context - The mutable check context.
 * @param run - The check to run in the fresh scope.
 * @returns Whatever the check returns.
 */
function inFreshScope<T>(context: CheckContext, run: () => T): T {
  context.scopes.push({});
  context.aliases.push({});
  context.structs.push({});
  context.fns.push({});
  try {
    return run();
  } finally {
    context.scopes.pop();
    context.aliases.pop();
    context.structs.pop();
    context.fns.pop();
  }
}

/**
 * Check a block expression: its statements in a fresh scope, then the kind of
 * its value. Reached from the expression walkers through the check context,
 * so a block expression is checked exactly like the block statement it is
 * spelled as.
 * @param expr - The block expression to check.
 * @param line - The 1-based line of the block's first statement.
 * @param context - The mutable check context.
 * @returns The block's first semantic error, or the kind of its value.
 */
function checkBlockExpr(
  expr: BlockExprNode,
  line: number,
  context: CheckContext,
): BlockExprCheck {
  return inFreshScope(context, () =>
    checkBlockValue(expr.statements, line, context),
  );
}

/**
 * Check the statements of a block expression, whose scope is already pushed,
 * and infer the kind and number-suffix of its value: the value of its last
 * statement, which must be a `return` (a bare tail expression is one) or a
 * nested block that itself ends in one. A block that ends in anything else
 * has no value, which is a TypeMismatch.
 * @param statements - The block's statements, in source order.
 * @param line - The 1-based line of the block's first statement.
 * @param context - The mutable check context.
 * @returns The block's first semantic error, or the kind of its value.
 */
function checkBlockValue(
  statements: TuffStatement[],
  line: number,
  context: CheckContext,
): BlockExprCheck {
  const last = statements[statements.length - 1];
  const lastLine = line + statements.length - 1;
  const error = checkStatements(statements.slice(0, -1), line, context);
  if (error) return { error, kind: null };
  if (last?.kind === "Block") {
    return inFreshScope(context, () =>
      checkBlockValue(last.statements, lastLine, context),
    );
  }
  const lastError = last ? checkStatement(last, lastLine, context) : null;
  if (lastError) return { error: lastError, kind: null };
  if (last?.kind !== "Return") {
    return { error: { kind: "TypeMismatch", name: "", line }, kind: null };
  }
  const exprCtx = exprContext(context);
  return {
    error: null,
    kind: inferKind(last.value, exprCtx),
    suffix: exprSuffix(last.value, exprCtx),
  };
}

/**
 * Check an `if` statement: its condition, then-branch, and optional else-branch.
 * @param stmt - The If statement to check.
 * @param line - The 1-based line number.
 * @param context - The mutable check context.
 * @returns A TuffError if a semantic error is found, else null.
 */
function checkIf(
  stmt: IfNode,
  line: number,
  context: CheckContext,
): TuffError | null {
  const condError = findUndeclared(stmt.condition, line, exprContext(context));
  if (condError) return condError;
  const error = checkInScope(stmt.then, line, context);
  return error ?? (stmt.else ? checkInScope(stmt.else, line, context) : null);
}

/**
 * Check a `while` statement: its condition and body.
 * @param stmt - The While statement to check.
 * @param line - The 1-based line number.
 * @param context - The mutable check context.
 * @returns A TuffError if a semantic error is found, else null.
 */
function checkWhile(
  stmt: WhileNode,
  line: number,
  context: CheckContext,
): TuffError | null {
  const condError = findUndeclared(stmt.condition, line, exprContext(context));
  if (condError) return condError;
  const prev = context.inLoop;
  context.inLoop = true;
  try {
    return checkInScope(stmt.body, line, context);
  } finally {
    context.inLoop = prev;
  }
}

/**
 * Check a `for` statement: its range expression, then its body in a fresh
 * scope where the loop variable is declared as a mutable number.
 * @param stmt - The For statement to check.
 * @param line - The 1-based line number.
 * @param context - The mutable check context.
 * @returns A TuffError if a semantic error is found, else null.
 */
function checkFor(
  stmt: ForNode,
  line: number,
  context: CheckContext,
): TuffError | null {
  const reservedError = checkReservedName(stmt.name, line);
  if (reservedError) return reservedError;
  const scopes = context.scopes;
  const exprCtx = exprContext(context);
  const rangeError = findUndeclared(stmt.range, line, exprCtx);
  if (rangeError) return rangeError;
  const rangeKind = inferKind(stmt.range, exprCtx);
  if (rangeKind !== null && rangeKind !== "range") {
    return { kind: "TypeMismatch", name: stmt.name, line };
  }
  const boundsError = checkRangeLiterals(stmt.range, line, exprCtx);
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
      undefined,
      scopes,
    );
    const prev = context.inLoop;
    context.inLoop = true;
    try {
      return checkInScope(stmt.body, line, context);
    } finally {
      context.inLoop = prev;
    }
  } finally {
    scopes.pop();
  }
}

/**
 * Check an assignment statement against the target binding's declaration.
 * Handles both identifier targets and dereference targets.
 * @param stmt - The assignment statement to check.
 * @param line - The 1-based line number.
 * @param context - The mutable check context.
 * @returns A TuffError if a semantic error is found, else null.
 */
function checkAssignment(
  stmt: AssignNode,
  line: number,
  context: CheckContext,
): TuffError | null {
  const scopes = context.scopes;
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
    const resolved = resolveIndex(stmt.target, line, exprContext(context));
    if ("kind" in resolved) return resolved;
    name = resolved.name;
    declared = resolved.binding;
  } else {
    return { kind: "InvalidDeref", name: "", line };
  }
  if (!declared.mut) return { kind: "ImmutableAssignment", name, line };
  const danglingError = checkDanglingRef(stmt.value, declared, scopes, line);
  if (danglingError) return danglingError;
  const exprCtx = exprContext(context);
  const valueError = findUndeclared(stmt.value, line, exprCtx);
  if (valueError) return valueError;
  const rangeError = checkRangeLiterals(stmt.value, line, exprCtx);
  if (rangeError) return rangeError;
  const suffixError = checkNumberSuffixes(stmt.value, line);
  if (suffixError) return suffixError;
  const expected =
    stmt.target.kind === "ArrayIndex"
      ? elementKind(stmt.target, exprCtx)
      : declared.kind;
  const kind = inferKind(stmt.value, exprCtx);
  if (expected && kind && kind !== expected) {
    return { kind: "TypeMismatch", name, line };
  }
  return null;
}

/**
 * Check that storing a reference id in a binding does not create a dangling
 * reference: the referent must be declared in a scope that is the same as or
 * outer to the holder binding's own scope, so it cannot die before the
 * binding that holds the reference id. Applies to every assignment target
 * (identifier, dereference, and array index), since any of them can store a
 * reference id.
 * @param value - The assignment value expression.
 * @param declared - The holder binding's declaration (the binding that will
 * store the reference id).
 * @param scopes - The stack of declared bindings.
 * @param line - The 1-based line number.
 * @returns A DanglingReference error if the referent does not outlive the
 * holder, else null.
 */
function checkDanglingRef(
  value: TuffExpr,
  declared: DeclaredBinding,
  scopes: Record<string, DeclaredBinding>[],
  line: number,
): TuffError | null {
  if (value.kind !== "Ref") return null;
  if (value.operand.kind !== "Identifier") return null;
  const referent = findDeclared(scopes, value.operand.name);
  if (!referent) return null;
  if (referent.depth > declared.depth) {
    return { kind: "DanglingReference", name: value.operand.name, line };
  }
  return null;
}

/**
 * The element kind an array-index assignment must match, or null if the
 * element kind is not statically known.
 * @param target - The ArrayIndex assignment target.
 * @param context - The expression check context.
 * @returns The expected element kind, or null if not statically inferable.
 */
function elementKind(
  target: ArrayIndexNode,
  context: ExprCheckContext,
): ValueKind | null {
  const kinds = arrayElementKinds(target.operand, context);
  if (!kinds) return null;
  const index = literalIndex(target.index);
  return index !== null && index < kinds.length ? (kinds[index] ?? null) : null;
}
