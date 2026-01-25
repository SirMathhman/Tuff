import type { Interpreter } from "../../types/interpreter";
import { setArrayElement, isArrayInstance } from "../../utils/array";

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
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
  interpretWithScope: Interpreter,
): number | undefined {
  const aa = parseArrayElemAssignment(lhs);
  if (!aa || !scope.has(aa.arrayVarName) || !mutMap.has(aa.arrayVarName))
    return undefined;
  const arrayId = scope.get(aa.arrayVarName)!;
  if (!isArrayInstance(arrayId))
    throw new Error(`variable '${aa.arrayVarName}' is not an array`);
  const semiIdx = s.indexOf(";", eqIdx),
    rhsEnd = semiIdx === -1 ? s.length : semiIdx;
  const indexValue = interpretWithScope(
    aa.indexExpr,
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
  );
  const newValue = interpretWithScope(
    s.slice(eqIdx + 1, rhsEnd).trim(),
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
  );
  if (!setArrayElement(arrayId, indexValue, newValue))
    throw new Error(`array index ${indexValue} out of bounds`);
  if (semiIdx === -1) return newValue;
  const rest = s.slice(semiIdx + 1).trim();
  return rest === ""
    ? newValue
    : interpretWithScope(
        rest,
        scope,
        typeMap,
        mutMap,
        uninitializedSet,
        unmutUninitializedSet,
      );
}

export function handleVarAssignment(
  s: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
  interpretWithScope: Interpreter,
): number | undefined {
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
  const arrayResult = handleArrayElementAssignment(
    lhs,
    eqIdx,
    s,
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    interpretWithScope,
  );
  if (arrayResult !== undefined) return arrayResult;
  if (!scope.has(lhs)) return undefined;
  const semiIdx = s.indexOf(";", eqIdx);
  if (!mutMap.has(lhs)) throw new Error(`variable '${lhs}' is immutable`);
  const rhsEnd = semiIdx === -1 ? s.length : semiIdx;
  const newValue = interpretWithScope(
    s.slice(eqIdx + 1, rhsEnd).trim(),
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
  );
  let finalValue = newValue;
  if (isCompound) {
    const currentValue = scope.get(lhs)!;
    const operator = prevChar!;
    if (operator === "+") finalValue = currentValue + newValue;
    else if (operator === "-") finalValue = currentValue - newValue;
    else if (operator === "*") finalValue = currentValue * newValue;
    else if (operator === "/") {
      if (newValue === 0) throw new Error("divide by 0");
      finalValue = Math.floor(currentValue / newValue);
    } else return undefined;
  }
  scope.set(lhs, finalValue);
  if (unmutUninitializedSet.has(lhs)) {
    unmutUninitializedSet.delete(lhs);
    mutMap.delete(lhs);
  }
  if (semiIdx === -1) return finalValue;
  const rest = s.slice(semiIdx + 1).trim();
  return rest === ""
    ? finalValue
    : interpretWithScope(
        rest,
        scope,
        typeMap,
        mutMap,
        uninitializedSet,
        unmutUninitializedSet,
      );
}
