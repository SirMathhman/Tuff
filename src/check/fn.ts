import { err } from "../errors.ts";
import { ErrorKind } from "../errors.ts";
import type { EvalError } from "../errors.ts";
import { StatementType } from "../ast/index.ts";
import type { Expr, FnDeclStmt, Statement } from "../ast/index.ts";
import { Err, Ok } from "../result.ts";
import type { Result } from "../result.ts";
import { ValueKind } from "../eval/value.ts";
import type { Binding } from "../eval/value.ts";

type IntTypeInfer = (expr: Expr, env: Map<string, Binding>) => string | null;
type CheckMutabilityFn = (
  statements: readonly Statement[],
  env: Map<string, Binding>,
) => Result<null, EvalError>;

export function checkFnDecl(
  stmt: FnDeclStmt,
  env: Map<string, Binding>,
  shadowed: Map<string, Binding | null>,
  checkMutability: CheckMutabilityFn,
  inferType: IntTypeInfer,
): Result<null, EvalError> {
  const bodyEnv = new Map<string, Binding>();
  for (const param of stmt.params) {
    bodyEnv.set(param.name, {
      value: { kind: ValueKind.Number, value: 0 },
      mutable: false,
      intType: param.type,
    });
  }
  const body = checkMutability(stmt.body, bodyEnv);
  if (!body.ok) return body;
  const returns = checkFnReturns(stmt.body, stmt.returnType, bodyEnv, inferType);
  if (!returns.ok) return returns;
  if (!hasUnconditionalReturn(stmt.body)) {
    return Err(
      err(
        ErrorKind.Semantic,
        `Function "${stmt.name}" must return a value on all paths`,
        stmt.position,
      ),
    );
  }
  if (!shadowed.has(stmt.name)) {
    shadowed.set(stmt.name, env.get(stmt.name) ?? null);
  }
  env.set(stmt.name, {
    value: {
      kind: ValueKind.Fn,
      params: stmt.params,
      returnType: stmt.returnType,
      body: stmt.body,
    },
    mutable: false,
  });
  return Ok(null);
}

export function checkFnReturns(
  statements: readonly Statement[],
  returnType: string,
  env: Map<string, Binding>,
  inferType: IntTypeInfer,
): Result<null, EvalError> {
  for (const stmt of statements) {
    if (stmt.type === StatementType.Return) {
      const retType = inferType(stmt.value, env);
      if (retType !== null && retType !== returnType) {
        return Err(
          err(
            ErrorKind.Semantic,
            `Function return type is "${returnType}" but returned "${retType}"`,
            stmt.position,
          ),
        );
      }
    } else if (stmt.type === StatementType.Block) {
      const inner = checkFnReturns(stmt.statements, returnType, env, inferType);
      if (!inner.ok) return inner;
    } else if (stmt.type === StatementType.If) {
      const then = checkFnReturns(stmt.then, returnType, env, inferType);
      if (!then.ok) return then;
      if (stmt.else) {
        const elseResult = checkFnReturns(stmt.else, returnType, env, inferType);
        if (!elseResult.ok) return elseResult;
      }
    } else if (stmt.type === StatementType.While) {
      const inner = checkFnReturns(stmt.body, returnType, env, inferType);
      if (!inner.ok) return inner;
    }
  }
  return Ok(null);
}

export function hasUnconditionalReturn(statements: readonly Statement[]): boolean {
  for (const stmt of statements) {
    if (guaranteedToReturn(stmt)) return true;
  }
  return false;
}

function guaranteedToReturn(stmt: Statement): boolean {
  switch (stmt.type) {
    case StatementType.Return:
      return true;
    case StatementType.Block:
      return hasUnconditionalReturn(stmt.statements);
    case StatementType.If:
      return (
        stmt.else !== null && hasUnconditionalReturn(stmt.then) && hasUnconditionalReturn(stmt.else)
      );
    case StatementType.Let:
    case StatementType.Assign:
    case StatementType.While:
    case StatementType.FnDecl:
    case StatementType.StructDecl:
      return false;
  }
}
