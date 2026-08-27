import type { TuffError } from "../errors.ts";
import type { FnNode, TuffStatement } from "../ast.ts";
import {
  declareBinding,
  kindValueKind,
  resolveKindName,
  type CheckContext,
  type FnDef,
} from "./kinds.ts";
import { checkKindName } from "./is-match.ts";

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
 * Check a `fn` declaration: each parameter's and the return's kind name must
 * name legal suffixes/kinds (with bare names resolved through the alias
 * stack), then register the function in the innermost scope. The body is
 * checked in a fresh scope where the parameters are declared as immutable
 * bindings of their declared kinds.
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
  const params: FnDef["params"] = [];
  for (const param of stmt.params) {
    const resolved = resolveKindName(param.type, context.aliases);
    const error = checkKindName(resolved, line, context.structs);
    if (error) return error;
    params.push({ name: param.name, kind: kindValueKind(resolved) });
  }
  const resolvedReturn = resolveKindName(stmt.returnType, context.aliases);
  const returnError = checkKindName(resolvedReturn, line, context.structs);
  if (returnError) return returnError;
  const scope = context.fns[context.fns.length - 1];
  if (scope)
    scope[stmt.name] = {
      params,
      returnType: kindValueKind(resolvedReturn),
    };
  return checkFnBody(stmt, line, context, params, checkStatement);
}

/**
 * Check a `fn` body in a fresh scope where the parameters are declared as
 * immutable bindings of their declared kinds.
 * @param stmt - The Fn statement whose body to check.
 * @param line - The 1-based line number.
 * @param context - The mutable check context.
 * @param params - The declared parameter names and kinds.
 * @param checkStatement - The statement checker, breaking mutual recursion.
 * @returns A TuffError if a semantic error is found, else null.
 */
function checkFnBody(
  stmt: FnNode,
  line: number,
  context: CheckContext,
  params: FnDef["params"],
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
    return checkStatement(stmt.body, line, context);
  } finally {
    context.scopes.pop();
    context.aliases.pop();
    context.structs.pop();
    context.fns.pop();
  }
}
