import { findOperatorIndex, performBinaryOp } from "../operators";
import { parseTypedNumber, extractTypedInfo } from "../parser";

export type Interpreter = (
  input: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
) => number;

export function handleIfExpression(
  s: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
  interpretWithScope: Interpreter,
): number | undefined {
  if (s.indexOf("if ") !== 0) return undefined;
  const cIdx = s.indexOf(")");
  if (cIdx <= 0) return undefined;

  const cond = interpretWithScope(
    s.slice(4, cIdx),
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
  );
  let elseIdx = -1;
  let ifDepth = 0;
  let parenDepth = 0;
  let braceDepth = 0;

  for (let i = cIdx + 1; i < s.length; i++) {
    if (s[i] === "(") parenDepth++;
    else if (s[i] === ")") parenDepth--;
    else if (s[i] === "{") braceDepth++;
    else if (s[i] === "}") braceDepth--;
    else if (
      parenDepth === 0 &&
      braceDepth === 0 &&
      s.slice(i, i + 5) === " else"
    ) {
      if (ifDepth === 0) {
        elseIdx = i;
        break;
      }
      ifDepth--;
    } else if (
      parenDepth === 0 &&
      braceDepth === 0 &&
      s.slice(i, i + 3) === "if " &&
      (i === 0 || " \t\n".includes(s.charAt(i - 1)))
    ) {
      ifDepth++;
    }
  }

  if (elseIdx > 0) {
    const thenStr = s.slice(cIdx + 1, elseIdx).trim(),
      elseStr = s.slice(elseIdx + 6).trim();
    return cond !== 0
      ? interpretWithScope(
          thenStr,
          scope,
          typeMap,
          mutMap,
          uninitializedSet,
          unmutUninitializedSet,
        )
      : interpretWithScope(
          elseStr,
          scope,
          typeMap,
          mutMap,
          uninitializedSet,
          unmutUninitializedSet,
        );
  }
  const thenStr = s.slice(cIdx + 1).trim();
  if (cond !== 0) {
    return interpretWithScope(
      thenStr,
      scope,
      typeMap,
      mutMap,
      uninitializedSet,
      unmutUninitializedSet,
    );
  }
  return 0;
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
  if (
    eqIdx <= 0 ||
    s[eqIdx + 1] === "=" ||
    !scope.has(s.slice(0, eqIdx).trim())
  )
    return undefined;

  const lhs = s.slice(0, eqIdx).trim();
  const semiIdx = s.indexOf(";", eqIdx);
  if (!mutMap.has(lhs)) throw new Error(`variable '${lhs}' is immutable`);
  if (semiIdx === -1) return undefined;

  const newValue = interpretWithScope(
    s.slice(eqIdx + 1, semiIdx).trim(),
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
  );
  scope.set(lhs, newValue);
  if (unmutUninitializedSet.has(lhs)) {
    unmutUninitializedSet.delete(lhs);
    mutMap.delete(lhs);
  }
  const rest = s.slice(semiIdx + 1).trim();
  if (rest === "") {
    return newValue;
  }
  return interpretWithScope(
    rest,
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
  );
}

export function handleBinaryOperation(
  s: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
  interpretWithScope: Interpreter,
): number {
  const { index: opIndex, operator: op } = findOperatorIndex(s);
  if (opIndex === -1) return parseTypedNumber(s);
  return performBinaryOp(
    interpretWithScope(
      s.slice(0, opIndex).trim(),
      scope,
      typeMap,
      mutMap,
      uninitializedSet,
      unmutUninitializedSet,
    ),
    op,
    interpretWithScope(
      s.slice(opIndex + 1).trim(),
      scope,
      typeMap,
      mutMap,
      uninitializedSet,
      unmutUninitializedSet,
    ),
    extractTypedInfo(s.slice(0, opIndex).trim()),
    s.slice(opIndex + 1).trim(),
  );
}
