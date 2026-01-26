import { extractTypedInfo } from "../../parser";
import { functionDefs, setFunctionRef } from "../../functions";
import { handleFunctionTypeAnnotation } from "../../core/function-type-handler";
import { isFunctionType } from "../../utils/function/function-utils";
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
import type { ScopeContext } from "../../types/interpreter";
import { callInterpreter } from "../../types/interpreter";
import {
  isPointerTypeMutable,
  handleReferenceOperation,
} from "../../handlers/access/pointer-operations";

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
  if (colonIndexInVarPart === -1)
    throw new Error("uninitialized variable must have type annotation");
  const varName = varPart.slice(0, colonIndexInVarPart).trim();
  const typeStr = varPart.slice(colonIndexInVarPart + 1).trim();
  let vType = 0;
  if (isArrayTypeAnnotation(typeStr)) vType = -4;
  else {
    vType = extractTypeFromAnnotation(typeStr, typeMap);
    if (vType === 0 && typeMap.has("__union__" + typeStr))
      throw new Error("invalid type annotation");
  }
  return { varName, varValue: 0, vType, typeName: typeStr };
}

function handleFunctionTypeInit(
  declaredTypeStr: string,
  exprStr: string,
  varName: string,
  typeMap: Map<string, number>,
): { handled: boolean; vType: number } {
  const result = handleFunctionTypeAnnotation(
    declaredTypeStr,
    exprStr,
    varName,
    typeMap,
    functionDefs,
  );
  if (!result.handled) throw new Error("invalid function type");
  return { handled: true, vType: result.vType };
}

function handleArrayTypeInit(
  declaredTypeStr: string,
  exprStr: string,
  typeMap: Map<string, number>,
): { handled: boolean; varValue: number; vType: number } {
  const arrayInfo = extractArrayTypeInfo(declaredTypeStr, typeMap);
  if (!arrayInfo) throw new Error("invalid array type");
  const literalValues = parseArrayLiteral(exprStr);
  if (literalValues === undefined)
    throw new Error(`invalid array literal: ${exprStr}`);
  if (literalValues.length !== arrayInfo.arrayType.initializedCount) {
    throw new Error(
      `array literal has ${literalValues.length} values but initialized count is ${arrayInfo.arrayType.initializedCount}`,
    );
  }
  const varValue = createArray(
    arrayInfo.arrayType.elementType,
    arrayInfo.arrayType.initializedCount,
    arrayInfo.arrayType.capacity,
    literalValues,
  );
  return { handled: true, varValue, vType: -4 };
}

function inferValueAndType(
  exprStr: string,
  declaredTypeStr: string | undefined,
  ctx: ScopeContext,
): { varValue: number; vType: number } {
  // Special handling for pointer types
  let varValue: number;
  if (declaredTypeStr?.trim().startsWith("*")) {
    const trimmedExpr = exprStr.trim();
    const pointerTypeIsMutable = isPointerTypeMutable(declaredTypeStr);

    // If expression starts with &, handle as reference operation
    if (trimmedExpr.startsWith("&")) {
      // Extract pointer base type (e.g., "I32" from "*I32" or "*mut I32")
      let pointerBaseType: string | undefined;
      const afterStar = declaredTypeStr.slice(1).trim();
      if (afterStar.startsWith("mut ")) {
        pointerBaseType = afterStar.slice(4).trim();
      } else {
        pointerBaseType = afterStar;
      }

      // Call reference operation with mutability constraint and type check
      const refOpResult = handleReferenceOperation(
        exprStr,
        ctx.scope,
        ctx.mutMap,
        pointerTypeIsMutable,
        ctx.typeMap,
        pointerBaseType,
      );
      if (refOpResult === undefined) {
        varValue = callInterpreter(ctx, exprStr);
      } else {
        varValue = refOpResult;
      }
    } else {
      // Not a reference operation - evaluate and check if result is a pointer
      varValue = callInterpreter(ctx, exprStr);
      // If we get here, varValue should be a pointer value (>= 1000 from interpreter)
      // The interpreter returns 0 if the value is not found, so we validate
      if (varValue < 1000 && varValue !== 0) {
        // This is a non-pointer value being assigned to pointer type
        throw new Error(
          `cannot assign non-pointer value to pointer type '${declaredTypeStr}'`,
        );
      }
    }
  } else {
    varValue = callInterpreter(ctx, exprStr);
  }

  const registeredLambdaName = getLastRegisteredLambdaName();
  if (registeredLambdaName && varValue === 1) return { varValue, vType: -2 };
  let vType = 0;
  if (declaredTypeStr) {
    const typeResult = extractAndValidateType(
      exprStr,
      declaredTypeStr,
      ctx.typeMap,
      ctx.scope,
    );
    vType = typeResult.vType;
  } else {
    vType =
      extractTypedInfo(exprStr).typeSize ||
      (ctx.scope.has(exprStr) ? ctx.typeMap.get(exprStr) || 0 : 0);
  }
  return { varValue, vType };
}

function handleTypedInit(
  declaredTypeStr: string,
  exprStr: string,
  varName: string,
  ctx: ScopeContext,
): { varValue: number; vType: number } {
  if (isFunctionType(declaredTypeStr))
    return {
      vType: handleFunctionTypeInit(
        declaredTypeStr,
        exprStr,
        varName,
        ctx.typeMap,
      ).vType,
      varValue: 1,
    };
  if (isArrayTypeAnnotation(declaredTypeStr)) {
    const result = handleArrayTypeInit(declaredTypeStr, exprStr, ctx.typeMap);
    return { varValue: result.varValue, vType: result.vType };
  }
  const result = inferValueAndType(exprStr, declaredTypeStr, ctx);
  registerLastLambdaIfNeeded(varName, result.varValue);
  return result;
}

function registerLastLambdaIfNeeded(varName: string, varValue: number): void {
  const registeredLambdaName = getLastRegisteredLambdaName();
  if (registeredLambdaName && varValue === 1) {
    setFunctionRef(varName, registeredLambdaName);
    clearLastRegisteredLambdaName();
  }
}

function handleUntypedInit(
  exprStr: string,
  varName: string,
  ctx: ScopeContext,
): { varValue: number; vType: number } {
  const result = inferValueAndType(exprStr, undefined, ctx);
  registerLastLambdaIfNeeded(varName, result.varValue);
  return result;
}

function extractVarNameAndType(beforeEq: string): {
  varName: string;
  declaredTypeStr: string | undefined;
} {
  const colonIdx = beforeEq.indexOf(":");
  const varName =
    colonIdx !== -1 ? beforeEq.slice(0, colonIdx).trim() : beforeEq;
  const declaredTypeStr =
    colonIdx !== -1 ? beforeEq.slice(colonIdx + 1).trim() : undefined;
  return { varName, declaredTypeStr };
}

export function handleVariableInitialization(
  beforeEq: string,
  eqIndex: number,
  declStr: string,
  isMut: boolean,
  ctx: ScopeContext,
): DeclurationResult {
  const { varName, declaredTypeStr } = extractVarNameAndType(beforeEq);
  const exprStr = declStr.slice(eqIndex + 1).trim();
  const result = declaredTypeStr
    ? handleTypedInit(declaredTypeStr, exprStr, varName, ctx)
    : handleUntypedInit(exprStr, varName, ctx);
  return {
    varName,
    varValue: result.varValue,
    vType: result.vType,
    typeName: declaredTypeStr,
  };
}
