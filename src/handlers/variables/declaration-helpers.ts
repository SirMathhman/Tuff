import { extractTypedInfo } from "../../parser";
import type { Interpreter } from "../../expressions/handlers";
import { functionDefs, setFunctionRef } from "../../functions";
import { handleFunctionTypeAnnotation } from "../../function-type-handler";
import { isFunctionType } from "../../utils/function-utils";
import {
  getLastRegisteredLambdaName,
  clearLastRegisteredLambdaName,
} from "../functions/lambda-expressions";
import {
  extractTypeFromAnnotation,
  extractAndValidateType,
} from "../../utils/scope-helpers";
import {
  isArrayTypeAnnotation,
  extractArrayTypeInfo,
  parseArrayLiteral,
  createArray,
} from "../../utils/array";

export interface DeclurationResult {
  varName: string;
  varValue: number;
  vType: number;
  typeName: string | undefined;
}

export function handleUninitializedVariable(
  declStr: string,
  isMut: boolean,
  typeMap: Map<string, number>,
): DeclurationResult {
  const varPart = declStr.slice(4 + (isMut ? 4 : 0)).trim();
  const colonIndexInVarPart = varPart.indexOf(":");
  if (colonIndexInVarPart === -1) {
    throw new Error("uninitialized variable must have type annotation");
  }

  const varName = varPart.slice(0, colonIndexInVarPart).trim();
  const typeStr = varPart.slice(colonIndexInVarPart + 1).trim();

  let vType = 0;
  if (isArrayTypeAnnotation(typeStr)) {
    vType = -4;
  } else {
    vType = extractTypeFromAnnotation(typeStr, typeMap);
    if (vType === 0 && typeMap.has("__union__" + typeStr)) {
      throw new Error("invalid type annotation");
    }
  }

  return { varName, varValue: 0, vType, typeName: typeStr };
}

export function handleVariableInitialization(
  beforeEq: string,
  eqIndex: number,
  declStr: string,
  isMut: boolean,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
  visMap: Map<string, boolean>,
  interpreter: Interpreter,
): DeclurationResult {
  const colonIndexInBeforeEq = beforeEq.indexOf(":");
  const varName =
    colonIndexInBeforeEq !== -1
      ? beforeEq.slice(0, colonIndexInBeforeEq).trim()
      : beforeEq;

  const exprStr = declStr.slice(eqIndex + 1).trim();
  let varValue = 0;
  let vType = 0;
  let typeName: string | undefined;
  let isFunctionTypeAnnotation = false;
  let isArrayTypeAnnotation_var = false;
  let declaredTypeStr: string | undefined;

  if (colonIndexInBeforeEq !== -1) {
    declaredTypeStr = beforeEq.slice(colonIndexInBeforeEq + 1).trim();
    typeName = declaredTypeStr;
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
      if (!result.handled) throw new Error("invalid function type");
      vType = result.vType;
    } else if (isArrayTypeAnnotation(declaredTypeStr)) {
      const arrayInfo = extractArrayTypeInfo(declaredTypeStr, typeMap);
      if (!arrayInfo) throw new Error("invalid array type");

      const literalValues = parseArrayLiteral(exprStr);
      if (literalValues === undefined) {
        throw new Error(`invalid array literal: ${exprStr}`);
      }

      if (literalValues.length !== arrayInfo.arrayType.initializedCount) {
        throw new Error(
          `array literal has ${literalValues.length} values but initialized count is ${arrayInfo.arrayType.initializedCount}`,
        );
      }

      varValue = createArray(
        arrayInfo.arrayType.elementType,
        arrayInfo.arrayType.initializedCount,
        arrayInfo.arrayType.capacity,
        literalValues,
      );
      vType = -4;
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

  return { varName, varValue, vType, typeName };
}
