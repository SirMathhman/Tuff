import { type Result, ok, err } from "../core/result";
import { type TuffError } from "../core/error";
import { parseLiteral } from "../parse/parser";
import { isTypeCompatible } from "../utils/types";
import { updateDepth } from "../utils/validation";

export interface VariableEntry {
  value: number;
  suffix: string;
  isMutable: boolean;
}
interface VariableHandlerParams {
  stmt: string;
  newVars: Map<string, VariableEntry>;
  evaluator?: (
    expr: string,
    vars: Map<string, VariableEntry>,
  ) => Result<number, TuffError>;
}
const makeError = (
  cause: string,
  context: string,
  reason: string,
  fix: string,
): TuffError => ({ cause, context, reason, fix });

function resolveValue(
  valueStr: string,
  vars: Map<string, VariableEntry>,
  evaluator?: (
    expr: string,
    vars: Map<string, VariableEntry>,
  ) => Result<number, TuffError>,
  defaultSuffix: string = "",
): Result<{ num: number; suffix: string }, TuffError> {
  const varRef = vars.get(valueStr);
  if (varRef) return ok({ suffix: varRef.suffix, num: varRef.value });
  const parsed = parseLiteral(valueStr);
  if (parsed.ok)
    return ok({ num: parsed.value.num, suffix: parsed.value.suffix });
  if (!evaluator || !valueStr.trim().startsWith("if")) return parsed;
  const evalResult = evaluator(valueStr, vars);
  return evalResult.ok
    ? ok({ num: evalResult.value, suffix: defaultSuffix })
    : evalResult;
}

function validateVariableDeclaration(
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
      ? ok()
      : err(
          makeError(
            "Incompatible type assignment",
            `Variable: ${varTypeSuffix}, Value: ${valueSuffix}`,
            "Cannot assign a larger type to a smaller type variable",
            `Assign a compatible type, e.g., let x : U8 = 100U8; or let x : U16 = 100U8;`,
          ),
        );
}

function handleVariableDeclaration({
  stmt,
  newVars,
  evaluator,
}: VariableHandlerParams): Result<void, TuffError> {
  const isMutable = stmt.substring(4, 8) === "mut ",
    startIdx = isMutable ? 8 : 4,
    eqIdx = stmt.indexOf("="),
    nameTypePart = stmt.substring(startIdx, eqIdx).trim(),
    colonIdx = nameTypePart.indexOf(":"),
    varName =
      colonIdx === -1
        ? nameTypePart
        : nameTypePart.substring(0, colonIdx).trim(),
    varTypeSuffix =
      colonIdx === -1 ? "" : nameTypePart.substring(colonIdx + 1).trim(),
    valueStr = stmt.substring(eqIdx + 1).trim(),
    valueResult = resolveValue(valueStr, newVars, evaluator, "");
  if (!valueResult.ok) return valueResult;
  const validated = validateVariableDeclaration(
    varName,
    valueResult.value.suffix,
    varTypeSuffix,
    newVars,
  );
  if (!validated.ok) return validated;
  newVars.set(varName, {
    value: valueResult.value.num,
    suffix: varTypeSuffix || valueResult.value.suffix,
    isMutable,
  });
  return ok();
}

function handleVariableReassignment({
  stmt,
  newVars,
  evaluator,
}: VariableHandlerParams): Result<void, TuffError> {
  const eqIdx = stmt.indexOf("="),
    varName = stmt.substring(0, eqIdx).trim(),
    valueStr = stmt.substring(eqIdx + 1).trim(),
    existing = newVars.get(varName);
  if (!existing)
    return err(
      makeError(
        "Undefined variable",
        `Variable: ${varName}`,
        "Cannot reassign an undefined variable",
        "Declare the variable first with 'let'",
      ),
    );
  if (!existing.isMutable)
    return err(
      makeError(
        "Cannot reassign immutable variable",
        `Variable: ${varName}`,
        "This variable is not declared as mutable",
        `Declare it as mutable with 'let mut ${varName} = ...'`,
      ),
    );
  const valueResult = resolveValue(
    valueStr,
    newVars,
    evaluator,
    existing.suffix,
  );
  if (!valueResult.ok) return valueResult;
  return isTypeCompatible(valueResult.value.suffix, existing.suffix)
    ? ((existing.value = valueResult.value.num), ok())
    : err(
        makeError(
          "Incompatible type assignment",
          `Variable: ${existing.suffix}, Value: ${valueResult.value.suffix}`,
          "Cannot assign a larger type to a smaller type variable",
          "Assign a compatible type",
        ),
      );
}

export function parseVariableDeclarations(
  expr: string,
  vars: Map<string, VariableEntry>,
  evaluator?: (
    expr: string,
    vars: Map<string, VariableEntry>,
  ) => Result<number, TuffError>,
): Result<{ finalExpr: string; vars: Map<string, VariableEntry> }, TuffError> {
  let working = expr.trim(),
    depth,
    semicolonIdx,
    stmt,
    eqIdx,
    result;
  const newVars = new Map(vars);
  while (working.length > 0) {
    const isDecl = working.startsWith("let ");
    if (!isDecl && (newVars.size === 0 || !working.includes("="))) break;
    if (!isDecl && working.startsWith("if")) break;
    semicolonIdx = -1;
    depth = 0;
    for (let i = 0; i < working.length; i = i + 1) {
      const ch = working.charAt(i);
      depth = updateDepth(ch, depth);
      if (ch === ";" && depth === 0) {
        semicolonIdx = i;
        break;
      }
    }
    if (semicolonIdx === -1) break;
    stmt = working.substring(0, semicolonIdx).trim();
    working = working.substring(semicolonIdx + 1).trim();
    eqIdx = stmt.indexOf("=");
    if (eqIdx === -1) break;
    result = isDecl
      ? handleVariableDeclaration({ stmt, newVars, evaluator })
      : handleVariableReassignment({ stmt, newVars, evaluator });
    if (!result.ok) return result;
  }
  for (const [varName, entry] of newVars.entries()) {
    const origEntry = vars.get(varName);
    if (origEntry && origEntry.isMutable) origEntry.value = entry.value;
    else if (!origEntry) vars.set(varName, entry);
  }
  return ok({ finalExpr: working, vars });
}
