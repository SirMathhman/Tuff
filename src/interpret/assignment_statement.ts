import { Env } from "../env";
import { evaluateReturningOperand } from "../eval";
import {
  handleThisFieldAssignment,
  handleIndexAssignment,
  handleVariableOrDerefAssignment,
  type AssignmentParts,
} from "./assignment_handlers";

/** Result from handleAssignmentStatement */
export interface AssignmentStatementResult {
  handled: boolean;
  last?: unknown;
}

export function handleAssignmentStatement(
  assignParts: AssignmentParts,
  localEnv: Env,
  evaluateRhsLocal: (rhs: string, envLocal: Env) => unknown,
  convertOperandToNumber: (op: unknown) => number
): AssignmentStatementResult {
  const { isDeref, name, op, rhs, isThisField } = assignParts;

  // Handle this.field assignment
  if (isThisField) {
    handleThisFieldAssignment({ name, op, rhs, localEnv, evaluateRhsLocal });
    return { handled: true, last: undefined };
  }

  // Index assignment support: name[index] = rhs or name[index] += rhs
  if (assignParts.indexExpr !== undefined) {
    handleIndexAssignment(
      name,
      assignParts.indexExpr,
      op,
      rhs,
      localEnv,
      evaluateReturningOperand,
      evaluateRhsLocal,
      convertOperandToNumber
    );
    return { handled: true, last: undefined };
  }

  handleVariableOrDerefAssignment(
    isDeref,
    name,
    op,
    rhs,
    localEnv,
    evaluateRhsLocal
  );

  return { handled: true, last: undefined };
}
