import { type Result, ok, err } from "./result";
import { type TuffError } from "./error";
import { parseLiteral } from "./parser";
import { isTypeCompatible } from "./types";

export interface VariableEntry {
  value: number;
  suffix: string;
  isMutable: boolean;
}

function makeError(
  cause: string,
  context: string,
  reason: string,
  fix: string,
): TuffError {
  return { cause, context, reason, fix };
}

function resolveVariableValue(
  valueStr: string,
  vars: Map<string, VariableEntry>,
): Result<{ suffix: string; num: number }, TuffError> {
  const varRef = vars.get(valueStr);
  return varRef
    ? ok({ suffix: varRef.suffix, num: varRef.value })
    : parseLiteral(valueStr);
}

function validateVariableDeclaration(
  varName: string,
  valueSuffix: string,
  varTypeSuffix: string,
  existingVars: Map<string, VariableEntry>,
): Result<void, TuffError> {
  if (existingVars.has(varName)) {
    return err(
      makeError(
        "Variable already declared",
        `Variable: ${varName}`,
        "Cannot redeclare a variable in the same scope",
        `Use a different variable name, e.g., let x2 = ...;`,
      ),
    );
  }

  if (!isTypeCompatible(valueSuffix, varTypeSuffix)) {
    return err(
      makeError(
        "Incompatible type assignment",
        `Variable: ${varTypeSuffix}, Value: ${valueSuffix}`,
        "Cannot assign a larger type to a smaller type variable",
        `Assign a compatible type, e.g., let x : U8 = 100U8; or let x : U16 = 100U8;`,
      ),
    );
  }

  return ok();
}

function handleVariableDeclaration(
  stmt: string,
  newVars: Map<string, VariableEntry>,
): Result<void, TuffError> {
  const isMutable = stmt.substring(4, 8) === "mut ";
  const startIdx = isMutable ? 8 : 4;
  const eqIdx = stmt.indexOf("=");
  const nameTypePart = stmt.substring(startIdx, eqIdx).trim();
  const colonIdx = nameTypePart.indexOf(":");

  let varName = "";
  let varTypeSuffix = "";
  if (colonIdx === -1) {
    varName = nameTypePart;
  } else {
    varName = nameTypePart.substring(0, colonIdx).trim();
    varTypeSuffix = nameTypePart.substring(colonIdx + 1).trim();
  }

  const valueStr = stmt.substring(eqIdx + 1).trim();
  const resolved = resolveVariableValue(valueStr, newVars);
  if (!resolved.ok) return resolved;

  const { suffix: valueSuffix, num: valueNum } = resolved.value;

  const validated = validateVariableDeclaration(
    varName,
    valueSuffix,
    varTypeSuffix,
    newVars,
  );
  if (!validated.ok) return validated;

  newVars.set(varName, {
    value: valueNum,
    suffix: varTypeSuffix || valueSuffix,
    isMutable,
  });

  return ok();
}

function handleVariableReassignment(
  stmt: string,
  newVars: Map<string, VariableEntry>,
): Result<void, TuffError> {
  const eqIdx = stmt.indexOf("=");
  const varName = stmt.substring(0, eqIdx).trim();
  const valueStr = stmt.substring(eqIdx + 1).trim();

  const existing = newVars.get(varName);
  if (!existing) {
    return err(
      makeError(
        "Undefined variable",
        `Variable: ${varName}`,
        "Cannot reassign an undefined variable",
        "Declare the variable first with 'let'",
      ),
    );
  }

  if (!existing.isMutable) {
    return err(
      makeError(
        "Cannot reassign immutable variable",
        `Variable: ${varName}`,
        "This variable is not declared as mutable",
        `Declare it as mutable with 'let mut ${varName} = ...'`,
      ),
    );
  }

  const resolved = resolveVariableValue(valueStr, newVars);
  if (!resolved.ok) return resolved;

  const { suffix: valueSuffix, num: valueNum } = resolved.value;

  if (!isTypeCompatible(valueSuffix, existing.suffix)) {
    return err(
      makeError(
        "Incompatible type assignment",
        `Variable: ${existing.suffix}, Value: ${valueSuffix}`,
        "Cannot assign a larger type to a smaller type variable",
        `Assign a compatible type`,
      ),
    );
  }

  existing.value = valueNum;
  return ok();
}

export function parseVariableDeclarations(
  expr: string,
  vars: Map<string, VariableEntry>,
): Result<{ finalExpr: string; vars: Map<string, VariableEntry> }, TuffError> {
  let working = expr.trim();
  const newVars = new Map(vars);

  while (working.length > 0) {
    const isDecl = working.startsWith("let ");
    const isReassign = !isDecl && newVars.size > 0;

    if (!isDecl && !isReassign) break;

    let semicolonIdx = -1;
    for (let i = 0; i < working.length; i = i + 1) {
      if (working.charAt(i) === ";") {
        semicolonIdx = i;
        break;
      }
    }

    if (semicolonIdx === -1) break;

    const stmt = working.substring(0, semicolonIdx).trim();
    working = working.substring(semicolonIdx + 1).trim();

    const eqIdx = stmt.indexOf("=");
    if (eqIdx === -1) break;

    const result = isDecl
      ? handleVariableDeclaration(stmt, newVars)
      : handleVariableReassignment(stmt, newVars);

    if (!result.ok) return result;
  }

  // Propagate all variable changes back to original scope
  for (const [varName, entry] of newVars.entries()) {
    if (vars.has(varName)) {
      // Update existing variable (mutations)
      const origEntry = vars.get(varName);
      if (origEntry && origEntry.isMutable) {
        origEntry.value = entry.value;
      }
    } else {
      // Add newly declared variables to original scope
      vars.set(varName, entry);
    }
  }

  return ok({ finalExpr: working, vars });
}
