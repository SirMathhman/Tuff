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
 * The returns of a `fn` body: how many there are, the inferable kind of
 * each, and the number-suffix each carries.
 */
interface FnReturns {
  /** The number of `return` statements found. */
  count: number;
  /** The inferable kind of each return, in source order. */
  kinds: ValueKind[];
  /** The number-suffix each return carries, in source order. */
  suffixes: (string | undefined)[];
}

/**
 * Verify a `fn` body's returns: there must be at least one, all inferable
 * return kinds must agree with each other, and (when the return kind is
 * annotated) with the annotation. When the declaration is unannotated, the
 * inferred kind is registered on the function so call sites can use it. The
 * agreed return suffix is registered on every function, annotated or not,
 * so `is` type-tests on calls fold the same either way.
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
  const returns = collectReturns(stmt.body, exprCtx);
  if (returns.count === 0)
    return { kind: "TypeMismatch", name: stmt.name, line };
  const first = returns.kinds[0];
  for (const kind of returns.kinds) {
    if (first === undefined || kind !== first)
      return { kind: "TypeMismatch", name: stmt.name, line };
  }
  if (
    first !== undefined &&
    expectedReturn !== undefined &&
    first !== expectedReturn
  )
    return { kind: "TypeMismatch", name: stmt.name, line };
  const def = findFn(context.fns, stmt.name);
  if (def) {
    if (first !== undefined && expectedReturn === undefined) {
      def.returnType = first;
    }
    def.returnSuffix = agreedSuffix(returns.suffixes);
  }
  return null;
}

/**
 * The number-suffix every return carries, or undefined if any return
 * carries no suffix or the returns disagree on one.
 * @param suffixes - The suffix of each return, in source order.
 * @returns The agreed suffix, or undefined.
 */
function agreedSuffix(suffixes: (string | undefined)[]): string | undefined {
  const first = suffixes[0];
  if (first === undefined) return undefined;
  for (const suffix of suffixes) {
    if (suffix !== first) return undefined;
  }
  return first;
}

/**
 * Collect the returns of a statement: the inferable kind and number-suffix
 * of each `return`, recursing into blocks and control-flow bodies.
 * @param stmt - The statement to walk.
 * @param context - The expression check context.
 * @returns The returns found, with their kinds and suffixes.
 */
function collectReturns(
  stmt: TuffStatement,
  context: ExprCheckContext,
): FnReturns {
  const result: FnReturns = { count: 0, kinds: [], suffixes: [] };
  collectReturnsInto(stmt, context, result);
  return result;
}

/**
 * Append the returns of a statement to an accumulator, recursing into
 * blocks and control-flow bodies.
 * @param stmt - The statement to walk.
 * @param context - The expression check context.
 * @param result - The accumulator to append each return's kind and suffix to.
 */
function collectReturnsInto(
  stmt: TuffStatement,
  context: ExprCheckContext,
  result: FnReturns,
): void {
  if (stmt.kind === "Return") {
    const kind = inferKind(stmt.value, context);
    if (kind) result.kinds.push(kind);
    result.suffixes.push(exprSuffix(stmt.value, context));
    result.count++;
    return;
  }
  if (stmt.kind === "Block") {
    for (const inner of stmt.statements) {
      collectReturnsInto(inner, context, result);
    }
    return;
  }
  if (stmt.kind === "If") {
    collectReturnsInto(stmt.then, context, result);
    if (stmt.else) collectReturnsInto(stmt.else, context, result);
    return;
  }
  if (stmt.kind === "While" || stmt.kind === "For") {
    collectReturnsInto(stmt.body, context, result);
  }
}
