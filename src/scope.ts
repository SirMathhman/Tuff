import { extractTypedInfo } from "./parser";
import { extractTypeSize } from "./type-utils";
import type { Interpreter } from "./expressions/handlers";
import { isFunctionType } from "./functions";
import { handleFunctionTypeAnnotation } from "./function-type-handler";

export function handleVarDecl(
  s: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  interpreter: Interpreter,
  uninitializedSet: Set<string> = new Set(),
  unmutUninitializedSet: Set<string> = new Set(),
): number | undefined {
  if (s.indexOf("let ") !== 0) return undefined;
  let semiIndex = -1;
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth--;
    else if (ch === "{") braceDepth++;
    else if (ch === "}") braceDepth--;
    else if (ch === "[") bracketDepth++;
    else if (ch === "]") bracketDepth--;
    else if (
      ch === ";" &&
      braceDepth === 0 &&
      parenDepth === 0 &&
      bracketDepth === 0
    ) {
      semiIndex = i;
      break;
    }
  }
  let declStr: string, restIndex: number;

  if (semiIndex === -1) {
    const eqIndex = s.indexOf("=");
    if (eqIndex === -1) return undefined;
    const afterEq = s.slice(eqIndex + 1).trim(),
      trimLenDiff = s.slice(eqIndex + 1).length - afterEq.length;

    if (afterEq.startsWith("match") || afterEq.startsWith("loop")) {
      let exprBraceDepth = 0,
        exprParenDepth = 0,
        exprBraceCloseIdx = -1;
      for (let i = 0; i < afterEq.length; i++) {
        const ch = afterEq[i];
        if (ch === "(") exprParenDepth++;
        else if (ch === ")") exprParenDepth--;
        else if (ch === "{") exprBraceDepth++;
        else if (ch === "}") {
          exprBraceDepth--;
          if (exprBraceDepth === 0 && exprParenDepth === 0) {
            exprBraceCloseIdx = i;
            break;
          }
        }
      }
      if (exprBraceCloseIdx !== -1) {
        restIndex = eqIndex + 1 + trimLenDiff + exprBraceCloseIdx + 1;
        declStr = s.slice(0, restIndex);
      } else return undefined;
    } else return undefined;
  } else {
    declStr = s.slice(0, semiIndex);
    restIndex = semiIndex + 1;
  }

  const isMut = declStr.indexOf("mut ") !== -1;
  let eqIndex = -1;
  for (let i = 0; i < declStr.length; i++) {
    if (
      declStr[i] === "=" &&
      (i + 1 >= declStr.length || declStr[i + 1] !== ">") &&
      (i === 0 || declStr[i - 1] !== "=")
    ) {
      eqIndex = i;
      break;
    }
  }

  let varName: string,
    varValue: number = 0,
    vType = 0;
  if (eqIndex === -1) {
    // No assignment - just declaration with type
    const varPart = declStr.slice(4 + (isMut ? 4 : 0)).trim(),
      colonIndex = varPart.indexOf(":");
    if (colonIndex === -1) return undefined;
    varName = varPart.slice(0, colonIndex).trim();
    const typeStr = varPart.slice(colonIndex + 1).trim();
    vType = extractTypeSize(typeStr);
    // Check if it's a type alias
    if (vType === 0 && typeMap.has("__alias__" + typeStr))
      vType = typeMap.get("__alias__" + typeStr) || 0;
    if (vType === 0 && typeMap.has("__union__" + typeStr)) return undefined;
  } else {
    // Has assignment
    const beforeEq = declStr.slice(4 + (isMut ? 4 : 0), eqIndex).trim();
    let colonIndex = -1,
      parenDepth = 0;
    for (let i = 0; i < beforeEq.length; i++) {
      const ch = beforeEq[i];
      if (ch === "(") parenDepth++;
      else if (ch === ")") parenDepth--;
      else if (ch === ":" && parenDepth === 0) {
        colonIndex = i;
        break;
      }
    }
    varName =
      colonIndex !== -1 ? beforeEq.slice(0, colonIndex).trim() : beforeEq;

    const exprStr = declStr.slice(eqIndex + 1).trim();
    let isFunctionTypeAnnotation = false;
    if (colonIndex !== -1) {
      const typeStr = beforeEq.slice(colonIndex + 1).trim();
      isFunctionTypeAnnotation = isFunctionType(typeStr);
    }
    if (!isFunctionTypeAnnotation) {
      varValue = interpreter(
        exprStr,
        scope,
        typeMap,
        mutMap,
        uninitializedSet,
        unmutUninitializedSet,
      );
    }
    vType =
      extractTypedInfo(exprStr).typeSize ||
      (scope.has(exprStr) ? typeMap.get(exprStr) || 0 : 0);
    if (colonIndex !== -1) {
      const typeStr = beforeEq.slice(colonIndex + 1).trim();
      if (isFunctionType(typeStr)) {
        const result = handleFunctionTypeAnnotation(typeStr, exprStr, varName, typeMap);
        if (!result.handled) return undefined;
        vType = result.vType;
      } else {
        let dType = extractTypeSize(typeStr);
        if (dType === 0 && typeMap.has("__alias__" + typeStr))
          dType = typeMap.get("__alias__" + typeStr) || 0;
        if (dType === 0 && typeMap.has("__union__" + typeStr)) {
          if (vType === 0) {
            let typeStart = exprStr.length - 1;
            while (typeStart >= 0) {
              const char = exprStr[typeStart];
              if (char === undefined || char < "0" || char > "9") break;
              typeStart--;
            }
            if (typeStart >= 0 && typeStart < exprStr.length) {
              const typeSuffix = exprStr.slice(typeStart),
                firstChar = typeSuffix[0];
              if (firstChar === "I" || firstChar === "U")
                vType = extractTypeSize(typeSuffix);
            }
          }
          dType = -1;
        }
        if (dType > 0) {
          if (vType > 0 && vType > dType)
            throw new Error(`bad type: ${vType} to U${dType}`);
          vType = dType;
        } else if (dType === -1) {
          /* Union type */
        }
      }
    }
  }

  if (scope.has(varName))
    throw new Error(`variable '${varName}' already declared`);

  scope.set(varName, varValue);
  if (vType > 0) typeMap.set(varName, vType);
  else if (vType === -2) typeMap.set(varName, -2);
  // Mark as mutable if explicitly declared with 'mut' or if uninitialized
  if (isMut || eqIndex === -1) {
    mutMap.set(varName, true);
  }
  // Track uninitialized variables - but only those WITHOUT mut become immutable after first assignment
  if (eqIndex === -1) {
    uninitializedSet.add(varName);
    // Only add to unmutUninitializedSet if it's NOT declared with mut
    if (!isMut) {
      unmutUninitializedSet.add(varName);
    }
  }

  const rest = s.slice(restIndex).trim();
  if (rest) {
    return interpreter(
      rest,
      scope,
      typeMap,
      mutMap,
      uninitializedSet,
      unmutUninitializedSet,
    );
  }
  return varValue;
}
