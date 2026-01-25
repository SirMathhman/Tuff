import type { Interpreter, InterpreterContext } from "../types/interpreter";

import { trackDepths } from "../utils/scope-helpers";
export { handleVarAssignment } from "../handlers/variables/assignment";
export type { Interpreter, InterpreterContext };

function findElseClauseIndex(s: string, startIdx: number): number {
  let elseIdx = -1,
    ifDepth = 0;
  trackDepths(s, startIdx, s.length, (i, d) => {
    if (d.paren === 0 && d.brace === 0 && s.slice(i, i + 5) === " else") {
      if (ifDepth === 0) {
        elseIdx = i;
        return true;
      }
      ifDepth--;
    } else if (
      d.paren === 0 &&
      d.brace === 0 &&
      s.slice(i, i + 3) === "if " &&
      (i === 0 || " \t\n".includes(s.charAt(i - 1)))
    ) {
      ifDepth++;
    }
    return false;
  });
  return elseIdx;
}

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
  const elseIdx = findElseClauseIndex(s, cIdx + 1);
  const thenStr = s.slice(cIdx + 1, elseIdx > 0 ? elseIdx : s.length).trim(),
    elseStr = elseIdx > 0 ? s.slice(elseIdx + 6).trim() : "";
  return cond !== 0
    ? interpretWithScope(
        thenStr,
        scope,
        typeMap,
        mutMap,
        uninitializedSet,
        unmutUninitializedSet,
      )
    : elseStr
      ? interpretWithScope(
          elseStr,
          scope,
          typeMap,
          mutMap,
          uninitializedSet,
          unmutUninitializedSet,
        )
      : 0;
}
