import type { ScopeContext } from "../types/interpreter";
import { callInterpreter } from "../types/interpreter";
import {
  handleDestructuring,
  isDestructuringPattern,
} from "../handlers/variables/destructuring";
import {
  handleUninitializedVariable,
  handleVariableInitialization,
} from "../handlers/variables/declaration-helpers";
import { findEqualIndex } from "../utils/scope-helpers";
import { getTypeNameForVar } from "../expressions/drop-helpers";
import { isValidIdentifier } from "../utils/identifier-utils";

export interface ParseVarInitParams {
  remaining: string;
  declStr: string;
  isMut: boolean;
  isPublic: boolean;
  restIndex: number;
  ctx: ScopeContext;
}
export interface ProcessDeclParams {
  varName: string;
  varValue: number;
  vType: number;
  typeName: string | undefined;
  isMut: boolean;
  isPublic: boolean;
  eqIndex: number;
  restIndex: number;
  remaining: string;
  ctx: ScopeContext;
}

function handleDestructuringInit(
  varName: string,
  declStr: string,
  eqIndex: number,
  isPublic: boolean,
  isMut: boolean,
  restIndex: number,
  remaining: string,
  ctx: ScopeContext,
) {
  const exprStr = declStr.slice(eqIndex + 1).trim();
  const structValue = handleDestructuring(
    varName,
    exprStr,
    isPublic,
    isMut,
    ctx,
  );
  const rest = remaining.slice(restIndex).trim();
  return {
    varName: "",
    varValue: rest ? callInterpreter(ctx, rest) : structValue,
    vType: 0,
    typeName: undefined,
  };
}

function handleInitializedVariable(
  eqIndex: number,
  declStr: string,
  isMut: boolean,
  isPublic: boolean,
  restIndex: number,
  remaining: string,
  ctx: ScopeContext,
) {
  const beforeEq = declStr.slice(4 + (isMut ? 4 : 0), eqIndex).trim();
  if (isDestructuringPattern(beforeEq))
    return handleDestructuringInit(
      beforeEq,
      declStr,
      eqIndex,
      isPublic,
      isMut,
      restIndex,
      remaining,
      ctx,
    );
  return handleVariableInitialization(beforeEq, eqIndex, declStr, isMut, ctx);
}

export function parseVariableInit(params: ParseVarInitParams) {
  const { remaining, declStr, isMut, isPublic, restIndex, ctx } = params;
  const eqIndex = findEqualIndex(declStr);
  const result =
    eqIndex === -1
      ? handleUninitializedVariable(declStr, isMut, ctx.typeMap)
      : handleInitializedVariable(
          eqIndex,
          declStr,
          isMut,
          isPublic,
          restIndex,
          remaining,
          ctx,
        );
  return { result, eqIndex };
}

export function processParsedDeclaration(params: ProcessDeclParams): number {
  const {
    varName,
    varValue,
    vType,
    typeName,
    isMut,
    isPublic,
    eqIndex,
    restIndex,
    remaining,
    ctx,
  } = params;
  if (!varName) return varValue;
  if (ctx.scope.has(varName))
    throw new Error(`variable '${varName}' already declared`);
  ctx.scope.set(varName, varValue);
  if (vType > 0) ctx.typeMap.set(varName, vType);
  else if (vType === -2) ctx.typeMap.set(varName, -2);
  if (typeName)
    ctx.typeMap.set("__vartype__" + varName, typeName as unknown as number);
  if (isMut || eqIndex === -1) ctx.mutMap.set(varName, true);
  ctx.visMap.set(varName, isPublic);
  if (eqIndex === -1) {
    ctx.uninitializedSet.add(varName);
    if (!isMut) ctx.unmutUninitializedSet.add(varName);
  }

  // Track move semantics: if RHS is a variable with destructor type, mark it as moved
  if (eqIndex !== -1) {
    let declStr = remaining.slice(0, restIndex).trimEnd();
    if (declStr.endsWith(";")) declStr = declStr.slice(0, -1);
    const rhsStr = declStr.slice(eqIndex + 1).trim();
    if (isValidIdentifier(rhsStr) && ctx.scope.has(rhsStr)) {
      const sourceTypeName = getTypeNameForVar(rhsStr, new Map(), ctx.typeMap);
      if (sourceTypeName && ctx.typeMap.has("__drop__" + sourceTypeName)) {
        if (!ctx.movedSet) ctx.movedSet = new Set();
        ctx.movedSet.add(rhsStr);
      }
    }
  }

  const rest = remaining.slice(restIndex).trim();
  return rest ? callInterpreter(ctx, rest) : varValue;
}
