import { type Result, ok } from "../core/result";
import { type TuffError } from "../core/error";
import { parseLiteral } from "../parse/parser";
import { updateDepth, isArithmeticOperator } from "../utils/validation";
import { type VariableEntry } from "./variables-types";
import {
  validateVariableDeclaration,
  validateVariableExists,
  validateVariableMutability,
  validateReassignmentType,
} from "./variables-helpers";

export type { VariableEntry };
interface VariableHandlerParams {
  stmt: string;
  newVars: Map<string, VariableEntry>;
  evaluator?: (
    expr: string,
    vars: Map<string, VariableEntry>,
  ) => Result<number, TuffError>;
}

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
  if (!evaluator) return parsed;
  const needsEval = valueStr.trim().startsWith("if") || valueStr.includes(" ");
  if (!needsEval) return parsed;
  const evalResult = evaluator(valueStr, vars);
  return evalResult.ok
    ? ok({ num: evalResult.value, suffix: defaultSuffix })
    : evalResult;
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
  return ok(undefined);
}

function parseCompoundOperator(
  stmt: string,
  eqIdx: number,
): {
  compoundOp: string;
  actualVarName: string;
  adjustedEqIdx: number;
} {
  const beforeEq = stmt.substring(0, eqIdx),
    varName = beforeEq.trim();
  let compoundOp = "",
    actualVarName = varName,
    adjustedEqIdx = eqIdx;
  if (eqIdx > 0 && stmt[eqIdx - 1]) {
    const prevChar = stmt[eqIdx - 1];
    if (isArithmeticOperator(prevChar)) {
      compoundOp = prevChar;
      actualVarName = beforeEq.substring(0, beforeEq.length - 1).trim();
      adjustedEqIdx = eqIdx - 1;
    }
  }
  return { compoundOp, actualVarName, adjustedEqIdx };
}

function handleVariableReassignment({
  stmt,
  newVars,
  evaluator,
}: VariableHandlerParams): Result<void, TuffError> {
  let eqIdx = stmt.indexOf("=");
  const { compoundOp, actualVarName, adjustedEqIdx } = parseCompoundOperator(
    stmt,
    eqIdx,
  );
  eqIdx = adjustedEqIdx;
  const valueStr = stmt.substring(eqIdx + (compoundOp ? 2 : 1)).trim();
  const existingResult = validateVariableExists(
    actualVarName,
    newVars.get(actualVarName),
  );
  if (!existingResult.ok) return existingResult;
  const existing = existingResult.value;
  const mutabilityCheck = validateVariableMutability(actualVarName, existing);
  if (!mutabilityCheck.ok) return mutabilityCheck;
  const expandedValueStr = compoundOp
    ? `${actualVarName} ${compoundOp} ${valueStr}`
    : valueStr;
  const valueResult = resolveValue(
    expandedValueStr,
    newVars,
    evaluator,
    existing.suffix,
  );
  if (!valueResult.ok) return valueResult;
  const typeCheck = validateReassignmentType(
    valueResult.value.suffix,
    existing.suffix,
  );
  if (!typeCheck.ok) return typeCheck;
  existing.value = valueResult.value.num;
  return ok(undefined);
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
