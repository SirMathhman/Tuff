import { extractTypedInfo } from "./parser";
import type { Interpreter } from "./expressions/handlers";
import { functionDefs, setFunctionRef } from "./functions";
import { handleFunctionTypeAnnotation } from "./function-type-handler";
import { isFunctionType } from "./utils/function-utils";
import {
  getLastRegisteredLambdaName,
  clearLastRegisteredLambdaName,
} from "./handlers/lambda-expressions";
import {
  findSemicolonIndex,
  findEqualIndex,
  extractTypeFromAnnotation,
  extractAndValidateType,
  findColonInBeforeEq,
} from "./utils/scope-helpers";

function findDeclStringAndRestIndex(s: string): {
  declStr: string;
  restIndex: number;
} {
  const semiIndex = findSemicolonIndex(s);
  let declStr: string, restIndex: number;

  if (semiIndex === -1) {
    const eqIndex = s.indexOf("=");
    if (eqIndex === -1) return { declStr: "", restIndex: 0 };
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
      } else return { declStr: "", restIndex: 0 };
    } else return { declStr: "", restIndex: 0 };
  } else {
    declStr = s.slice(0, semiIndex);
    restIndex = semiIndex + 1;
  }

  return { declStr, restIndex };
}

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
  const { declStr, restIndex } = findDeclStringAndRestIndex(s);
  if (!declStr) return undefined;

  // Check if variable is mutable by looking for "mut " after "let " and before the colon
  const afterLet = declStr.slice(4);
  const colonIndex = afterLet.indexOf(":");
  const beforeColon =
    colonIndex !== -1 ? afterLet.slice(0, colonIndex) : afterLet;
  const isMut = beforeColon.indexOf("mut ") !== -1;
  const eqIndex = findEqualIndex(declStr);

  let varName: string,
    varValue: number = 0,
    vType = 0;

  if (eqIndex === -1) {
    const varPart = declStr.slice(4 + (isMut ? 4 : 0)).trim(),
      colonIndexInVarPart = varPart.indexOf(":");
    if (colonIndexInVarPart === -1) return undefined;
    varName = varPart.slice(0, colonIndexInVarPart).trim();
    const typeStr = varPart.slice(colonIndexInVarPart + 1).trim();
    vType = extractTypeFromAnnotation(typeStr, typeMap);
    if (vType === 0 && typeMap.has("__union__" + typeStr)) return undefined;
  } else {
    const beforeEq = declStr.slice(4 + (isMut ? 4 : 0), eqIndex).trim();
    const colonIndexInBeforeEq = findColonInBeforeEq(beforeEq);
    varName =
      colonIndexInBeforeEq !== -1
        ? beforeEq.slice(0, colonIndexInBeforeEq).trim()
        : beforeEq;

    const exprStr = declStr.slice(eqIndex + 1).trim();
    let isFunctionTypeAnnotation = false;
    let declaredTypeStr: string | undefined;

    if (colonIndexInBeforeEq !== -1) {
      declaredTypeStr = beforeEq.slice(colonIndexInBeforeEq + 1).trim();
      isFunctionTypeAnnotation = isFunctionType(declaredTypeStr);
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
      const registeredLambdaName = getLastRegisteredLambdaName();
      if (registeredLambdaName && varValue === 1) {
        setFunctionRef(varName, registeredLambdaName);
        vType = -2;
        clearLastRegisteredLambdaName();
      }
    }

    if (colonIndexInBeforeEq !== -1 && declaredTypeStr) {
      if (isFunctionType(declaredTypeStr)) {
        const result = handleFunctionTypeAnnotation(
          declaredTypeStr,
          exprStr,
          varName,
          typeMap,
          functionDefs,
        );
        if (!result.handled) return undefined;
        vType = result.vType;
      } else {
        const typeResult = extractAndValidateType(
          exprStr,
          declaredTypeStr,
          typeMap,
          scope,
        );
        vType = typeResult.vType;
      }
    } else {
      vType =
        extractTypedInfo(exprStr).typeSize ||
        (scope.has(exprStr) ? typeMap.get(exprStr) || 0 : 0);
    }
  }

  if (scope.has(varName))
    throw new Error(`variable '${varName}' already declared`);

  scope.set(varName, varValue);
  if (vType > 0) typeMap.set(varName, vType);
  else if (vType === -2) typeMap.set(varName, -2);

  if (isMut || eqIndex === -1) {
    mutMap.set(varName, true);
  }

  if (eqIndex === -1) {
    uninitializedSet.add(varName);
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
