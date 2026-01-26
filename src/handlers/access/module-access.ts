import { getModule } from "../../types/modules";
import { getObject } from "../../types/objects";
import type { Interpreter } from "../../expressions/handlers";
import { isValidIdentifier } from "../../utils/identifier-utils";
import type { BaseHandlerParams } from "../../utils/function/function-call-params";

function handleModuleFunctionCall(
  moduleName: string,
  memberStr: string,
  module: ReturnType<typeof getModule>,
  interpreter: Interpreter,
): number {
  const fnName = memberStr.slice(0, memberStr.indexOf("(")).trim();
  const isPublic = module!.visMap.get(fnName);
  if (!isPublic) {
    throw new Error(`member '${fnName}' of module '${moduleName}' is private`);
  }
  return interpreter(
    memberStr,
    module!.scope,
    module!.typeMap,
    module!.mutMap,
    new Set(),
    new Set(),
  );
}

function handleModuleVariableAccess(
  moduleName: string,
  memberStr: string,
  module: ReturnType<typeof getModule>,
): number | undefined {
  if (!module!.scope.has(memberStr)) {
    throw new Error(`module '${moduleName}' has no member '${memberStr}'`);
  }
  const isPublic = module!.visMap.get(memberStr);
  if (!isPublic) {
    throw new Error(
      `member '${memberStr}' of module '${moduleName}' is private`,
    );
  }
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
  const fnName = memberStr.slice(0, memberStr.indexOf("(")).trim();
  const isPublic = obj!.visMap.get(fnName);
  if (!isPublic) {
    throw new Error(`member '${fnName}' of object '${objectName}' is private`);
  }
  return interpreter(
    memberStr,
    obj!.scope,
    obj!.typeMap,
    obj!.mutMap,
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
  const isPublic = obj!.visMap.get(memberStr);
  if (!isPublic) {
    throw new Error(
      `member '${memberStr}' of object '${objectName}' is private`,
    );
  }
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
    const memberStr = trimmed.slice(dotIndex + 1).trim();
    if (!isValidIdentifier(objectName)) return undefined;
    if (!p.typeMap.has("__object__" + objectName)) return undefined;
    const obj = getObject(objectName);
    if (!obj) return undefined;
    return handleObjectMemberAccess(objectName, memberStr, obj, p.interpreter);
  }

  return undefined;
}
