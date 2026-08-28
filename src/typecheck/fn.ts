import type { TuffError } from "../errors.ts";
import type { FnNode, TuffStatement } from "../ast.ts";
import {
  declareBinding,
  findFn,
  inferKind,
  kindValueKind,
  resolveKindName,
  type CheckContext,
  type ExprCheckContext,
  type FnDef,
  type ValueKind,
} from "./kinds.ts";
import { resolveDeref } from "./expressions.ts";
import { checkKindName, exprSuffix } from "./is-match.ts";
import { checkReservedName } from "./reserved.ts";

/**
 * A function that checks one statement in the current context. Passed to the
 * fn checker to break the mutual recursion between the fn body and the
 * statement checkers.
 */
export type CheckStatement = (
  stmt: TuffStatement,
  line: number,
  context: CheckContext,
) => TuffError | null;

/**
 * Check a `fn` declaration: each parameter's kind name (and the return's,
 * when annotated) must name legal suffixes/kinds (with bare names resolved
 * through the alias stack), then register the function in the innermost
 * scope. The body is checked in a fresh scope where the parameters are
 * declared as immutable bindings of their declared kinds.
 * @param stmt - The Fn statement to check.
 * @param line - The 1-based line number.
 * @param context - The mutable check context.
 * @param checkStatement - The statement checker, breaking mutual recursion.
 * @returns A TuffError if a semantic error is found, else null.
 */
export function checkFn(
  stmt: FnNode,
  line: number,
  context: CheckContext,
  checkStatement: CheckStatement,
): TuffError | null {
  const reservedError = checkReservedName(stmt.name, line);
  if (reservedError) return reservedError;
  const params: FnDef["params"] = [];
  for (const param of stmt.params) {
    const paramError = checkReservedName(param.name, line);
    if (paramError) return paramError;
    const resolved = resolveKindName(param.type, context.aliases);
    const error = checkKindName(resolved, line, context.structs);
    if (error) return error;
    params.push({ name: param.name, kind: kindValueKind(resolved) });
  }
  let returnType: ValueKind | undefined;
  if (stmt.returnType !== undefined) {
    const resolvedReturn = resolveKindName(stmt.returnType, context.aliases);
    const returnError = checkKindName(resolvedReturn, line, context.structs);
    if (returnError) return returnError;
    returnType = kindValueKind(resolvedReturn);
  }
  const scope = context.fns[context.fns.length - 1];
  if (scope)
    scope[stmt.name] = {
      params,
      returnType,
    };
  return checkFnBody(stmt, line, context, params, returnType, checkStatement);
}

/**
 * Check a `fn` body in a fresh scope where the parameters are declared as
 * immutable bindings of their declared kinds, then verify the body's returns
 * agree with each other and with the declared return kind (when annotated).
 * @param stmt - The Fn statement whose body to check.
 * @param line - The 1-based line number.
 * @param context - The mutable check context.
 * @param params - The declared parameter names and kinds.
 * @param expectedReturn - The declared return kind, if annotated.
 * @param checkStatement - The statement checker, breaking mutual recursion.
 * @returns A TuffError if a semantic error is found, else null.
 */
function checkFnBody(
  stmt: FnNode,
  line: number,
  context: CheckContext,
  params: FnDef["params"],
  expectedReturn: ValueKind | undefined,
  checkStatement: CheckStatement,
): TuffError | null {
  context.scopes.push({});
  context.aliases.push({});
  context.structs.push({});
  context.fns.push({});
  try {
    for (const param of params) {
      declareBinding(
        param.name,
        param.kind,
        false,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        context.scopes,
      );
    }
    const bodyError = checkStatement(stmt.body, line, context);
    if (bodyError) return bodyError;
    return checkReturnKinds(stmt, line, context, expectedReturn);
  } finally {
    context.scopes.pop();
    context.aliases.pop();
    context.structs.pop();
    context.fns.pop();
  }
}

/**
 * Verify a `fn` body's returns: there must be at least one, all inferable
 * return kinds must agree with each other, and (when the return kind is
 * annotated) with the annotation. When the declaration is unannotated, the
 * inferred kind is registered on the function so call sites can use it.
 * @param stmt - The Fn statement whose returns to check.
 * @param line - The 1-based line number.
 * @param context - The mutable check context, with the parameter scope pushed.
 * @param expectedReturn - The declared return kind, if annotated.
 * @returns A TypeMismatch error if the returns are missing or disagree, else null.
 */
function checkReturnKinds(
  stmt: FnNode,
  line: number,
  context: CheckContext,
  expectedReturn: ValueKind | undefined,
): TuffError | null {
  const exprCtx: ExprCheckContext = {
    scopes: context.scopes,
    structs: context.structs,
    fns: context.fns,
    resolveDeref,
  };
  const kinds: ValueKind[] = [];
  const returns = collectReturnKinds(stmt.body, exprCtx, kinds);
  if (returns === 0) return { kind: "TypeMismatch", name: stmt.name, line };
  const first = kinds[0];
  for (const kind of kinds) {
    if (first === undefined || kind !== first)
      return { kind: "TypeMismatch", name: stmt.name, line };
  }
  if (
    first !== undefined &&
    expectedReturn !== undefined &&
    first !== expectedReturn
  )
    return { kind: "TypeMismatch", name: stmt.name, line };
  if (first !== undefined && expectedReturn === undefined) {
    const def = findFn(context.fns, stmt.name);
    if (def) {
      def.returnType = first;
      def.returnSuffix = collectReturnSuffix(stmt.body, exprCtx);
    }
  }
  return null;
}

/**
 * The number-suffix every `return` in a `fn` body carries, or undefined if
 * any return carries no suffix or the returns disagree on one.
 * @param body - The function body to walk.
 * @param context - The expression check context.
 * @returns The agreed return suffix, or undefined.
 */
function collectReturnSuffix(
  body: TuffStatement,
  context: ExprCheckContext,
): string | undefined {
  const suffixes: (string | undefined)[] = [];
  collectReturnSuffixes(body, context, suffixes);
  const first = suffixes[0];
  if (first === undefined) return undefined;
  for (const suffix of suffixes) {
    if (suffix !== first) return undefined;
  }
  return first;
}

/**
 * Collect the number-suffix of every `return` in a statement, recursing
 * into blocks and control-flow bodies.
 * @param stmt - The statement to walk.
 * @param context - The expression check context.
 * @param suffixes - The array to append each return's suffix to.
 */
function collectReturnSuffixes(
  stmt: TuffStatement,
  context: ExprCheckContext,
  suffixes: (string | undefined)[],
): void {
  if (stmt.kind === "Return") {
    suffixes.push(exprSuffix(stmt.value, context));
    return;
  }
  if (stmt.kind === "Block") {
    for (const inner of stmt.statements) {
      collectReturnSuffixes(inner, context, suffixes);
    }
    return;
  }
  if (stmt.kind === "If") {
    collectReturnSuffixes(stmt.then, context, suffixes);
    if (stmt.else) collectReturnSuffixes(stmt.else, context, suffixes);
    return;
  }
  if (stmt.kind === "While" || stmt.kind === "For") {
    collectReturnSuffixes(stmt.body, context, suffixes);
  }
}

/**
 * Collect the inferable kinds of every `return` in a statement, recursing
 * into blocks and control-flow bodies.
 * @param stmt - The statement to walk.
 * @param context - The expression check context.
 * @param kinds - The array to append each inferable return kind to.
 * @returns The number of `return` statements found.
 */
function collectReturnKinds(
  stmt: TuffStatement,
  context: ExprCheckContext,
  kinds: ValueKind[],
): number {
  if (stmt.kind === "Return") {
    const kind = inferKind(stmt.value, context);
    if (kind) kinds.push(kind);
    return 1;
  }
  if (stmt.kind === "Block") {
    let count = 0;
    for (const inner of stmt.statements) {
      count += collectReturnKinds(inner, context, kinds);
    }
    return count;
  }
  if (stmt.kind === "If") {
    let count = collectReturnKinds(stmt.then, context, kinds);
    if (stmt.else) count += collectReturnKinds(stmt.else, context, kinds);
    return count;
  }
  if (stmt.kind === "While" || stmt.kind === "For") {
    return collectReturnKinds(stmt.body, context, kinds);
  }
  return 0;
}
