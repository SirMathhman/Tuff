import type { ScopeContext } from "../../types/interpreter";
import { callInterpreter } from "../../types/interpreter";
import { setArrayElement, isArrayInstance } from "../../utils/array";
import type { FunctionCallParams } from "../../utils/function/function-call-params";

function parseArrayElemAssignment(
  lhs: string,
): { arrayVarName: string; indexExpr: string } | undefined {
  const openIdx = lhs.indexOf("["),
    closeIdx = lhs.lastIndexOf("]");
  if (openIdx === -1 || closeIdx === -1 || closeIdx <= openIdx)
    return undefined;
  const arrayVarName = lhs.slice(0, openIdx).trim(),
    indexExpr = lhs.slice(openIdx + 1, closeIdx).trim();
  if (!arrayVarName || !indexExpr) return undefined;
  const first = arrayVarName[0];
  if (
    !first ||
    !(
      (first >= "a" && first <= "z") ||
      (first >= "A" && first <= "Z") ||
      first === "_"
    )
  )
    return undefined;
  for (let i = 1; i < arrayVarName.length; i++) {
    const ch = arrayVarName[i];
    if (
      !ch ||
      !(
        (ch >= "a" && ch <= "z") ||
        (ch >= "A" && ch <= "Z") ||
        (ch >= "0" && ch <= "9") ||
        ch === "_"
      )
    )
      return undefined;
  }
  return { arrayVarName, indexExpr };
}

function handleArrayElementAssignment(
  lhs: string,
  eqIdx: number,
  s: string,
  ctx: ScopeContext,
): number | undefined {
  const aa = parseArrayElemAssignment(lhs);
  if (
    !aa ||
    !ctx.scope.has(aa.arrayVarName) ||
    !ctx.mutMap.has(aa.arrayVarName)
  )
    return undefined;
  const arrayId = ctx.scope.get(aa.arrayVarName)!;
  if (!isArrayInstance(arrayId))
    throw new Error(`variable '${aa.arrayVarName}' is not an array`);
  const semiIdx = s.indexOf(";", eqIdx),
    rhsEnd = semiIdx === -1 ? s.length : semiIdx;
  const indexValue = callInterpreter(ctx, aa.indexExpr);
  const newValue = callInterpreter(ctx, s.slice(eqIdx + 1, rhsEnd).trim());
  if (!setArrayElement(arrayId, indexValue, newValue))
    throw new Error(`array index ${indexValue} out of bounds`);
  if (semiIdx === -1) return newValue;
  const rest = s.slice(semiIdx + 1).trim();
  return rest === "" ? newValue : callInterpreter(ctx, rest);
}

function applyCompoundOperator(
  operator: string,
  currentValue: number,
  newValue: number,
): number | undefined {
  if (operator === "+") return currentValue + newValue;
  if (operator === "-") return currentValue - newValue;
  if (operator === "*") return currentValue * newValue;
  if (operator === "/") {
    if (newValue === 0) throw new Error("divide by 0");
    return Math.floor(currentValue / newValue);
  }
  return undefined;
}

function handleRestAfterAssignment(
  finalValue: number,
  semiIdx: number,
  s: string,
  ctx: ScopeContext,
): number {
  if (semiIdx === -1) return finalValue;
  const rest = s.slice(semiIdx + 1).trim();
  return rest === "" ? finalValue : callInterpreter(ctx, rest);
}

function parseAssignmentInfo(s: string):
  | {
      eqIdx: number;
      isCompound: boolean;
      lhs: string;
      operator: string | undefined;
    }
  | undefined {
  const eqIdx = s.indexOf("=");
  if (eqIdx <= 0) return undefined;
  const prevChar = s[eqIdx - 1];
  const isCompound =
    prevChar === "+" ||
    prevChar === "-" ||
    prevChar === "*" ||
    prevChar === "/" ||
    prevChar === "!" ||
    prevChar === "<" ||
    prevChar === ">";
  if (s[eqIdx + 1] === "=") return undefined;
  const lhs = (isCompound ? s.slice(0, eqIdx - 1) : s.slice(0, eqIdx)).trim();
  return {
    eqIdx,
    isCompound,
    lhs,
    operator: isCompound ? prevChar : undefined,
  };
}

function evaluateAssignment(
  lhs: string,
  isCompound: boolean,
  operator: string | undefined,
  eqIdx: number,
  s: string,
  ctx: ScopeContext,
): { finalValue: number; semiIdx: number } {
  const semiIdx = s.indexOf(";", eqIdx);
  if (!ctx.mutMap.has(lhs)) throw new Error(`variable '${lhs}' is immutable`);
  const rhsEnd = semiIdx === -1 ? s.length : semiIdx;
  const newValue = callInterpreter(ctx, s.slice(eqIdx + 1, rhsEnd).trim());
  let finalValue = newValue;
  if (isCompound && operator) {
    const currentValue = ctx.scope.get(lhs)!;
    const result = applyCompoundOperator(operator, currentValue, newValue);
    if (result === undefined)
      throw new Error(`invalid compound operator: ${operator}`);
    finalValue = result;
  }
  ctx.scope.set(lhs, finalValue);
  if (ctx.unmutUninitializedSet.has(lhs)) {
    ctx.unmutUninitializedSet.delete(lhs);
    ctx.mutMap.delete(lhs);
  }
  return { finalValue, semiIdx };
}

type VarAssignParams = Pick<
  FunctionCallParams,
  | "s"
  | "scope"
  | "typeMap"
  | "mutMap"
  | "uninitializedSet"
  | "unmutUninitializedSet"
  | "interpreter"
  | "visMap"
>;

export function handleVarAssignment(p: VarAssignParams): number | undefined {
  const info = parseAssignmentInfo(p.s);
  if (!info) return undefined;
  const { eqIdx, isCompound, lhs, operator } = info;
  const ctx: ScopeContext = {
    scope: p.scope,
    typeMap: p.typeMap,
    mutMap: p.mutMap,
    uninitializedSet: p.uninitializedSet,
    unmutUninitializedSet: p.unmutUninitializedSet,
    visMap: p.visMap,
    interpreter: p.interpreter,
  };
  const arrayResult = handleArrayElementAssignment(lhs, eqIdx, p.s, ctx);
  if (arrayResult !== undefined) return arrayResult;
  if (!p.scope.has(lhs)) return undefined;
  const { finalValue, semiIdx } = evaluateAssignment(
    lhs,
    isCompound,
    operator,
    eqIdx,
    p.s,
    ctx,
  );
  return handleRestAfterAssignment(finalValue, semiIdx, p.s, ctx);
}
