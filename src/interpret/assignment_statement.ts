import { Env } from "../env";
import { evaluateReturningOperand } from "../eval";
import type { RuntimeValue } from "../types";
import {
  handleThisFieldAssignment,
  handleIndexAssignment,
  handleVariableOrDerefAssignment,
  type AssignmentParts,
} from "./assignment_handlers";

/** Result from handleAssignmentStatement */
export interface AssignmentStatementResult {
  handled: boolean;
  last?: RuntimeValue;
}

/** Context for handleAssignmentStatement */
export interface AssignmentStatementContext {
  assignParts: AssignmentParts;
  localEnv: Env;
  evaluateRhsLocal: (rhs: string, envLocal: Env) => unknown;
  convertOperandToNumber: (op: unknown) => number;
}

export function handleAssignmentStatement(
  ctx: AssignmentStatementContext
): AssignmentStatementResult {
  const { assignParts, localEnv, evaluateRhsLocal, convertOperandToNumber } =
    ctx;
  const { isDeref, name, op, rhs, isThisField } = assignParts;

  // Handle this.field assignment
  if (isThisField) {
    handleThisFieldAssignment({ name, op, rhs, localEnv, evaluateRhsLocal });
    return { handled: true, last: undefined };
  }

  // Index assignment support: name[index] = rhs or name[index] += rhs
  if (assignParts.indexExpr !== undefined) {
    handleIndexAssignment({
      name,
      indexExpr: assignParts.indexExpr,
      op,
      rhs,
      localEnv,
      evaluateReturningOperand,
      evaluateRhsLocal,
      convertOperandToNumber,
    });
    return { handled: true, last: undefined };
  }

  handleVariableOrDerefAssignment(isDeref, {
    name,
    op,
    rhs,
    localEnv,
    evaluateRhsLocal,
  });

  return { handled: true, last: undefined };
}
