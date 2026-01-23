import { type Result, ok, err } from "./result";
import { type TuffError } from "./error";
import { parseNumberWithSuffix } from "./parser";
import { isTypeCompatible } from "./types";

export interface VariableEntry {
  value: number;
  suffix: string;
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
  if (varRef) {
    return ok({ suffix: varRef.suffix, num: varRef.value });
  }
  return parseNumberWithSuffix(valueStr);
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

export function parseVariableDeclarations(
  expr: string,
  vars: Map<string, VariableEntry>,
): Result<{ finalExpr: string; vars: Map<string, VariableEntry> }, TuffError> {
  let working = expr.trim();
  const newVars = new Map(vars);

  while (working.startsWith("let ")) {
    let semicolonIdx = -1;
    for (let i = 0; i < working.length; i = i + 1) {
      if (working.charAt(i) === ";") {
        semicolonIdx = i;
        break;
      }
    }

    if (semicolonIdx === -1) break;

    const declStr = working.substring(0, semicolonIdx).trim();
    working = working.substring(semicolonIdx + 1).trim();

    const eqIdx = declStr.indexOf("=");
    if (eqIdx === -1) break;

    const nameTypePart = declStr.substring(4, eqIdx).trim();
    const colonIdx = nameTypePart.indexOf(":");

    let varName = "";
    let varTypeSuffix = "";
    if (colonIdx === -1) {
      varName = nameTypePart;
    } else {
      varName = nameTypePart.substring(0, colonIdx).trim();
      varTypeSuffix = nameTypePart.substring(colonIdx + 1).trim();
    }

    const valueStr = declStr.substring(eqIdx + 1).trim();
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
    });
  }

  return ok({ finalExpr: working, vars: newVars });
}
