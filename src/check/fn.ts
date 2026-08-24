import { err } from "../errors.ts";
import { ErrorKind } from "../errors.ts";
import type { EvalError } from "../errors.ts";
import { StatementType } from "../ast/index.ts";
import type { Expr, Statement } from "../ast/index.ts";
import { Err, Ok } from "../result.ts";
import type { Result } from "../result.ts";
import type { Binding } from "../eval/value.ts";

type IntTypeInfer = (expr: Expr, env: Map<string, Binding>) => string | null;

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
      return false;
  }
}
