import { handleVarDecl, evaluateGroupedExpressionsWithScope } from "./scope";
import { handleMatch } from "./match";
import { handleLoop } from "./loop";
import { findOperatorIndex, performBinaryOp } from "./operators";
import { parseTypedNumber, extractTypedInfo } from "./parser";

export function interpretWithScope(
  input: string,
  scope: Map<string, number> = new Map(),
  typeMap: Map<string, number> = new Map(),
  mutMap: Map<string, boolean> = new Map(),
): number {
  const s = input.trim();
  if (s === "") return 0;

  const declResult = handleVarDecl(
    s,
    scope,
    typeMap,
    mutMap,
    interpretWithScope,
  );
  if (declResult !== undefined) return declResult;

  const matchResult = handleMatch(
    s,
    scope,
    typeMap,
    mutMap,
    interpretWithScope,
  );
  if (matchResult !== undefined) return matchResult;

  const loopResult = handleLoop(
    s,
    scope,
    typeMap,
    mutMap,
    interpretWithScope,
  );
  if (loopResult !== undefined) return loopResult;

  if (s.indexOf("if ") === 0) {
    const cIdx = s.indexOf(")");
    if (cIdx > 0) {
      const cond = interpretWithScope(s.slice(4, cIdx), scope, typeMap, mutMap);
      let elseIdx = -1;
      let ifDepth = 0;
      let parenDepth = 0;
      let braceDepth = 0;

      // Find the matching "else" for this "if"
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
          ? interpretWithScope(thenStr, scope, typeMap, mutMap)
          : interpretWithScope(elseStr, scope, typeMap, mutMap);
      }
    }
  }

  const eqIdx = s.indexOf("=");
  if (
    eqIdx > 0 &&
    s[eqIdx + 1] !== "=" &&
    scope.has(s.slice(0, eqIdx).trim())
  ) {
    const lhs = s.slice(0, eqIdx).trim(),
      semiIdx = s.indexOf(";", eqIdx);
    if (!mutMap.has(lhs)) throw new Error(`variable '${lhs}' is immutable`);
    if (semiIdx !== -1) {
      scope.set(
        lhs,
        interpretWithScope(
          s.slice(eqIdx + 1, semiIdx).trim(),
          scope,
          typeMap,
          mutMap,
        ),
      );
      return interpretWithScope(
        s.slice(semiIdx + 1).trim(),
        scope,
        typeMap,
        mutMap,
      );
    }
  }

  if (scope.has(s.trim())) return scope.get(s.trim())!;
  if (
    !s.includes("+") &&
    !s.includes("-") &&
    !s.includes("*") &&
    !s.includes("/") &&
    !s.includes("(") &&
    !s.includes("{") &&
    !s.includes("[")
  ) {
    return parseTypedNumber(s);
  }
  const trimmedS = s.trim();
  const isMatch =
    trimmedS.startsWith("match") &&
    trimmedS.slice(5).trimStart().startsWith("(");
  if ((s.includes("(") || s.includes("{") || s.includes("[")) && !isMatch) {
    const processed = evaluateGroupedExpressionsWithScope(
      s,
      scope,
      typeMap,
      mutMap,
      interpretWithScope,
    );
    if (processed !== s)
      return interpretWithScope(processed, scope, typeMap, mutMap);
  }
  const { index: opIndex, operator: op } = findOperatorIndex(s);
  if (opIndex === -1) return parseTypedNumber(s);
  return performBinaryOp(
    interpretWithScope(s.slice(0, opIndex).trim(), scope, typeMap, mutMap),
    op,
    interpretWithScope(s.slice(opIndex + 1).trim(), scope, typeMap, mutMap),
    extractTypedInfo(s.slice(0, opIndex).trim()),
    s.slice(opIndex + 1).trim(),
  );
}

export function interpret(input: string): number {
  return interpretWithScope(input, new Map(), new Map(), new Map());
}
