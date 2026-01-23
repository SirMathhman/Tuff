import { type Result, ok, err } from "../core/result";
import { type TuffError } from "../core/error";
import { isTypeCompatible } from "../utils/types";
import { type VariableEntry } from "./variables-types";

export const makeError = (
  cause: string,
  context: string,
  reason: string,
  fix: string,
): TuffError => ({ cause, context, reason, fix });

export function validateVariableDeclaration(
  varName: string,
  valueSuffix: string,
  varTypeSuffix: string,
  existingVars: Map<string, VariableEntry>,
): Result<void, TuffError> {
  return existingVars.has(varName)
    ? err(
        makeError(
          "Variable already declared",
          `Variable: ${varName}`,
          "Cannot redeclare a variable in the same scope",
          `Use a different variable name, e.g., let x2 = ...;`,
        ),
      )
    : isTypeCompatible(valueSuffix, varTypeSuffix)
      ? ok(undefined)
      : err(
          makeError(
            "Incompatible type assignment",
            `Variable: ${varTypeSuffix}, Value: ${valueSuffix}`,
            "Cannot assign a larger type to a smaller type variable",
            `Assign a compatible type, e.g., let x : U8 = 100U8; or let x : U16 = 100U8;`,
          ),
        );
}

export function validateVariableExists(
  varName: string,
  entry: VariableEntry | undefined,
): Result<VariableEntry, TuffError> {
  return entry
    ? ok(entry)
    : err(
        makeError(
          "Undefined variable",
          `Variable: ${varName}`,
          "Cannot reassign an undefined variable",
          "Declare the variable first with 'let'",
        ),
      );
}

export function validateVariableMutability(
  varName: string,
  entry: VariableEntry,
): Result<void, TuffError> {
  return entry.isMutable
    ? ok(undefined)
    : err(
        makeError(
          "Cannot reassign immutable variable",
          `Variable: ${varName}`,
          "This variable is not declared as mutable",
          `Declare it as mutable with 'let mut ${varName} = ...'`,
        ),
      );
}

export function validateReassignmentType(
  valueSuffix: string,
  existingSuffix: string,
): Result<void, TuffError> {
  return isTypeCompatible(valueSuffix, existingSuffix)
    ? ok(undefined)
    : err(
        makeError(
          "Incompatible type assignment",
          `Variable: ${existingSuffix}, Value: ${valueSuffix}`,
          "Cannot assign a larger type to a smaller type variable",
          "Assign a compatible type",
        ),
      );
}
