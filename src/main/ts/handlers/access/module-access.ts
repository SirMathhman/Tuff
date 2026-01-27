import { getModule } from "../../types/modules";
import { getObject } from "../../types/objects";
import type { Interpreter } from "../../expressions/handlers";
import { isValidIdentifier } from "../../utils/identifier-utils";
import { isIdentifierChar } from "../../compiler/parsing/string-helpers";
import type { BaseHandlerParams } from "../../utils/function/function-call-params";

/**
 * Extract the valid member access portion from a string like "counter; Wrapper.counter"
 * Handles both field access (identifier) and function calls (identifier + parentheses)
 */
function extractMemberAccess(accessStr: string): string {
  let i = 0;
  // First, extract the identifier
  while (i < accessStr.length && isIdentifierChar(accessStr[i]!)) {
    i++;
  }
  if (i === 0) return accessStr; // No valid identifier
  
  const memberName = accessStr.slice(0, i);
  // Check if it's a function call
  if (i < accessStr.length && accessStr[i] === "(") {
    // Find matching closing paren
    let parenDepth = 1;
    let j = i + 1;
    while (j < accessStr.length && parenDepth > 0) {
      if (accessStr[j] === "(") parenDepth++;
      else if (accessStr[j] === ")") parenDepth--;
      j++;
    }
    return accessStr.slice(0, j);
  }
  
  return memberName;
}

function assertPublicMember(p: {
  ownerType: "module" | "object";
  ownerName: string;
  memberName: string;
  visMap: Map<string, boolean>;
}): void {
  const isPublic = p.visMap.get(p.memberName);
  if (!isPublic) {
    throw new Error(
      `member '${p.memberName}' of ${p.ownerType} '${p.ownerName}' is private`,
    );
  }
}

function handleModuleFunctionCall(
  moduleName: string,
  memberStr: string,
  module: ReturnType<typeof getModule>,
  interpreter: Interpreter,
): number {
  return handleScopedFunctionCall({
    ownerType: "module",
    ownerName: moduleName,
    memberStr,
    visMap: module!.visMap,
    scope: module!.scope,
    typeMap: module!.typeMap,
    mutMap: module!.mutMap,
    interpreter,
  });
}

function handleModuleVariableAccess(
  moduleName: string,
  memberStr: string,
  module: ReturnType<typeof getModule>,
): number | undefined {
  if (!module!.scope.has(memberStr)) {
    throw new Error(`module '${moduleName}' has no member '${memberStr}'`);
  }
  assertPublicMember({
    ownerType: "module",
    ownerName: moduleName,
    memberName: memberStr,
    visMap: module!.visMap,
  });
  return module!.scope.get(memberStr);
}

function handleModuleMemberAccess(
  moduleName: string,
  memberStr: string,
  module: ReturnType<typeof getModule>,
  interpreter: Interpreter,
): number | undefined {
  if (memberStr.includes("(")) {
    return handleModuleFunctionCall(moduleName, memberStr, module, interpreter);
  } else {
    return handleModuleVariableAccess(moduleName, memberStr, module);
  }
}

function handleObjectFunctionCall(
  objectName: string,
  memberStr: string,
  obj: ReturnType<typeof getObject>,
  interpreter: Interpreter,
): number {
  return handleScopedFunctionCall({
    ownerType: "object",
    ownerName: objectName,
    memberStr,
    visMap: obj!.visMap,
    scope: obj!.scope,
    typeMap: obj!.typeMap,
    mutMap: obj!.mutMap,
    interpreter,
  });
}

function handleScopedFunctionCall(p: {
  ownerType: "module" | "object";
  ownerName: string;
  memberStr: string;
  visMap: Map<string, boolean>;
  scope: Map<string, number>;
  typeMap: Map<string, number>;
  mutMap: Map<string, boolean>;
  interpreter: Interpreter;
}): number {
  const fnName = p.memberStr.slice(0, p.memberStr.indexOf("(")).trim();
  assertPublicMember({
    ownerType: p.ownerType,
    ownerName: p.ownerName,
    memberName: fnName,
    visMap: p.visMap,
  });
  return p.interpreter(
    p.memberStr,
    p.scope,
    p.typeMap,
    p.mutMap,
    new Set(),
    new Set(),
  );
}

function handleObjectVariableAccess(
  objectName: string,
  memberStr: string,
  obj: ReturnType<typeof getObject>,
): number | undefined {
  if (!obj!.scope.has(memberStr)) {
    throw new Error(`object '${objectName}' has no member '${memberStr}'`);
  }
  assertPublicMember({
    ownerType: "object",
    ownerName: objectName,
    memberName: memberStr,
    visMap: obj!.visMap,
  });
  return obj!.scope.get(memberStr);
}

function handleObjectMemberAccess(
  objectName: string,
  memberStr: string,
  obj: ReturnType<typeof getObject>,
  interpreter: Interpreter,
): number | undefined {
  if (memberStr.includes("(")) {
    return handleObjectFunctionCall(objectName, memberStr, obj, interpreter);
  } else {
    return handleObjectVariableAccess(objectName, memberStr, obj);
  }
}

export function handleModuleAccess(
  p: Pick<BaseHandlerParams, "s" | "typeMap" | "interpreter">,
): number | undefined {
  const trimmed = p.s.trim();
  const colonIndex = trimmed.indexOf("::");
  const dotIndex = trimmed.indexOf(".");

  if (colonIndex !== -1 && (dotIndex === -1 || colonIndex < dotIndex)) {
    const moduleName = trimmed.slice(0, colonIndex).trim();
    const memberStr = trimmed.slice(colonIndex + 2).trim();
    if (!isValidIdentifier(moduleName)) return undefined;
    if (!p.typeMap.has("__module__" + moduleName)) return undefined;
    const module = getModule(moduleName);
    if (!module) return undefined;
    return handleModuleMemberAccess(
      moduleName,
      memberStr,
      module,
      p.interpreter,
    );
  }

  if (dotIndex !== -1) {
    const objectName = trimmed.slice(0, dotIndex).trim();
    const afterObjectAndDot = trimmed.slice(dotIndex + 1).trim();
    // Only use extractMemberAccess for objects to handle statement boundaries
    const memberStr = extractMemberAccess(afterObjectAndDot);
    if (!isValidIdentifier(objectName)) return undefined;
    if (!p.typeMap.has("__object__" + objectName)) return undefined;
    const obj = getObject(objectName);
    if (!obj) return undefined;
    return handleObjectMemberAccess(objectName, memberStr, obj, p.interpreter);
  }

  return undefined;
}
