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
  evaluateRhsLocal: (rhs: string, envLocal: Env) => RuntimeValue;
  convertOperandToNumber: (op: RuntimeValue) => number;
}

export function handleAssignmentStatement(
  ctx: AssignmentStatementContext
): AssignmentStatementResult {
  const { assignParts, localEnv, evaluateRhsLocal, convertOperandToNumber } =
    ctx;
  const { flags, name, op, rhs, target } = assignParts;
  const { isDeref } = flags;

  // Handle this.field assignment
  if (target?.thisField) {
    handleThisFieldAssignment({ name, op, rhs, localEnv, evaluateRhsLocal });
    return { handled: true, last: undefined };
  }

  // Index assignment support: name[index] = rhs or name[index] += rhs
  if (target?.indexed) {
    handleIndexAssignment({
      name,
      indexExpr: target.indexed.indexExpr,
      rhsInfo: { op, rhs },
      localEnv,
      callbacks: {
        evaluateReturningOperand,
        evaluateRhsLocal,
        convertOperandToNumber,
      },
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
