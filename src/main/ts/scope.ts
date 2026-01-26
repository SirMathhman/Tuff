import type { Interpreter } from "./expressions/handlers";
import {
  findEqualIndex,
  findDeclStringAndRestIndex,
} from "./utils/scope-helpers";
import { handleExternStatement } from "./utils/native/extern-handler";
import { handleUseStatement } from "./utils/use-statement";
import type { ScopeContext } from "./types/interpreter";
import {
  parseVariableInit,
  processParsedDeclaration,
} from "./core/scope-helpers-ext";

function parseVariableWithType(
  declStr: string,
  remaining: string,
  restIndex: number,
  isPublic: boolean,
  ctx: ScopeContext,
): number {
  const afterLet = declStr.slice(4),
    colonIndex = afterLet.indexOf(":");
  const beforeColon =
    colonIndex !== -1 ? afterLet.slice(0, colonIndex) : afterLet;
  const isMut = beforeColon.indexOf("mut ") !== -1;
  const eqIndex = findEqualIndex(declStr);
  const { result } = parseVariableInit({
    remaining,
    declStr,
    isMut,
    isPublic,
    restIndex,
    ctx,
  });
  const { varName, varValue, vType, typeName } = result;
  return processParsedDeclaration({
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
  });
}

export function handleVarDecl(
  s: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  interpreter: Interpreter,
  uninitializedSet: Set<string> = new Set(),
  unmutUninitializedSet: Set<string> = new Set(),
  visMap: Map<string, boolean> = new Map(),
  movedSet: Set<string> = new Set(),
): number | undefined {
  const trimmed = s.trim(),
    isPublic = trimmed.startsWith("out ");
  const remaining = isPublic ? trimmed.slice(4).trim() : trimmed;
  const ctx: ScopeContext = {
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    visMap,
    movedSet,
    interpreter,
  };
  // Inline handleExternOrUse
  if (remaining.startsWith("extern "))
    return handleExternStatement(remaining.slice(7).trim(), ctx);
  if (remaining.startsWith("use "))
    return handleUseStatement(remaining.slice(4), ctx);
  if (!remaining.startsWith("let ")) return undefined;
  if (remaining.includes(" from "))
    return handleUseStatement(remaining.slice(4), ctx);
  const { declStr, restIndex } = findDeclStringAndRestIndex(remaining);
  if (!declStr) return undefined;
  return parseVariableWithType(declStr, remaining, restIndex, isPublic, ctx);
}
