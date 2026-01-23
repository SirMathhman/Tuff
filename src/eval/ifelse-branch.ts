import { type Result, ok, err } from "../core/result";
import { type TuffError } from "../core/error";
import { type VariableEntry } from "./variables";
import { isTypeCompatible } from "../utils/types";
import { parseLiteral } from "../parse/parser";
import { makeError } from "./ifelse-helpers";

function getBranchTypeSuffix(
  branch: string,
  vars: Map<string, VariableEntry>,
): string {
  const trimmed = branch.trim();
  const varEntry = vars.get(trimmed);
  if (varEntry) return varEntry.suffix;
  const parsed = parseLiteral(trimmed);
  return parsed.ok ? parsed.value.suffix : "";
}

function isAssignment(branch: string): boolean {
  const trimmed = branch.trim(),
    eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) return false;
  const beforeEq = trimmed.substring(0, eqIdx).trim();
  return (
    !beforeEq.includes(" ") &&
    beforeEq.length > 0 &&
    beforeEq[0] >= "a" &&
    beforeEq[0] <= "z"
  );
}

export function validateBranchTypes(
  thenBranch: string,
  elseBranch: string,
  vars: Map<string, VariableEntry>,
): Result<void, TuffError> {
  if (isAssignment(thenBranch) && isAssignment(elseBranch)) return ok();
  const thenType = getBranchTypeSuffix(thenBranch, vars),
    elseType = getBranchTypeSuffix(elseBranch, vars);
  if (thenType && elseType && !isTypeCompatible(thenType, elseType)) {
    return err(
      makeError(
        "Type error",
        `Then-branch: ${thenType}, Else-branch: ${elseType}`,
        "Both branches must return compatible types",
        `Ensure both branches return the same type or compatible numeric types (smaller to larger widening allowed)`,
      ),
    );
  }
  return ok();
}
