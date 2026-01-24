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
  findEqualIndex,
  extractTypeFromAnnotation,
  extractAndValidateType,
  findColonInBeforeEq,
  findDeclStringAndRestIndex,
} from "./utils/scope-helpers";
import {
  isArrayTypeAnnotation,
  extractArrayTypeInfo,
  parseArrayLiteral,
  createArray,
} from "./utils/array";

export function handleVarDecl(
  s: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  interpreter: Interpreter,
  uninitializedSet: Set<string> = new Set(),
  unmutUninitializedSet: Set<string> = new Set(),
  visMap: Map<string, boolean> = new Map(),
): number | undefined {
  // Check for visibility modifier 'out'
  const trimmed = s.trim();
  const isPublic = trimmed.startsWith("out ");
  const remaining = isPublic ? trimmed.slice(4).trim() : trimmed;
  
  if (!remaining.startsWith("let ")) return undefined;
  
  const { declStr, restIndex } = findDeclStringAndRestIndex(remaining);
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

    // Check if it's an array type
    if (isArrayTypeAnnotation(typeStr)) {
      vType = -4; // Special marker for array type
    } else {
      vType = extractTypeFromAnnotation(typeStr, typeMap);
      if (vType === 0 && typeMap.has("__union__" + typeStr)) return undefined;
    }
  } else {
    const beforeEq = declStr.slice(4 + (isMut ? 4 : 0), eqIndex).trim();
    const colonIndexInBeforeEq = findColonInBeforeEq(beforeEq);
    varName =
      colonIndexInBeforeEq !== -1
        ? beforeEq.slice(0, colonIndexInBeforeEq).trim()
        : beforeEq;

    const exprStr = declStr.slice(eqIndex + 1).trim();
    let isFunctionTypeAnnotation = false;
    let isArrayTypeAnnotation_var = false;
    let declaredTypeStr: string | undefined;

    if (colonIndexInBeforeEq !== -1) {
      declaredTypeStr = beforeEq.slice(colonIndexInBeforeEq + 1).trim();
      isFunctionTypeAnnotation = isFunctionType(declaredTypeStr);
      isArrayTypeAnnotation_var = isArrayTypeAnnotation(declaredTypeStr);
    }

    if (!isFunctionTypeAnnotation && !isArrayTypeAnnotation_var) {
      varValue = interpreter(
        exprStr,
        scope,
        typeMap,
        mutMap,
        uninitializedSet,
        unmutUninitializedSet,
        visMap,
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
      } else if (isArrayTypeAnnotation(declaredTypeStr)) {
        // Handle array type annotation
        const arrayInfo = extractArrayTypeInfo(declaredTypeStr, typeMap);
        if (!arrayInfo) return undefined;

        // Parse the array literal
        const literalValues = parseArrayLiteral(exprStr);
        if (literalValues === undefined) {
          throw new Error(`invalid array literal: ${exprStr}`);
        }

        // Validate that literal count matches initialized count
        if (literalValues.length !== arrayInfo.arrayType.initializedCount) {
          throw new Error(
            `array literal has ${literalValues.length} values but initialized count is ${arrayInfo.arrayType.initializedCount}`,
          );
        }

        // Create the array
        varValue = createArray(
          arrayInfo.arrayType.elementType,
          arrayInfo.arrayType.initializedCount,
          arrayInfo.arrayType.capacity,
          literalValues,
        );
        vType = -4; // Special marker for array variable
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
  
  // Store visibility information
  visMap.set(varName, isPublic);

  if (eqIndex === -1) {
    uninitializedSet.add(varName);
    if (!isMut) {
      unmutUninitializedSet.add(varName);
    }
  }

  const rest = remaining.slice(restIndex).trim();
  if (rest) {
    return interpreter(
      rest,
      scope,
      typeMap,
      mutMap,
      uninitializedSet,
      unmutUninitializedSet,
      visMap,
    );
  }
  return varValue;
}
