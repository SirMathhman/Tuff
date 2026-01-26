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

export function handleIfExpression(p: {
  s: string;
  scope: Map<string, number>;
  typeMap: Map<string, number>;
  mutMap: Map<string, boolean>;
  uninitializedSet: Set<string>;
  unmutUninitializedSet: Set<string>;
  interpreter: Interpreter;
}): number | undefined {
  if (p.s.indexOf("if ") !== 0) return undefined;
  const cIdx = p.s.indexOf(")");
  if (cIdx <= 0) return undefined;
  const cond = p.interpreter(
    p.s.slice(4, cIdx),
    p.scope,
    p.typeMap,
    p.mutMap,
    p.uninitializedSet,
    p.unmutUninitializedSet,
  );
  const elseIdx = findElseClauseIndex(p.s, cIdx + 1);
  const thenStr = p.s
      .slice(cIdx + 1, elseIdx > 0 ? elseIdx : p.s.length)
      .trim(),
    elseStr = elseIdx > 0 ? p.s.slice(elseIdx + 6).trim() : "";
  return cond !== 0
    ? p.interpreter(
        thenStr,
        p.scope,
        p.typeMap,
        p.mutMap,
        p.uninitializedSet,
        p.unmutUninitializedSet,
      )
    : elseStr
      ? p.interpreter(
          elseStr,
          p.scope,
          p.typeMap,
          p.mutMap,
          p.uninitializedSet,
          p.unmutUninitializedSet,
        )
      : 0;
}
