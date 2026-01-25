import { getModule } from "../types/modules";
import { getObject } from "../types/objects";
import type { Interpreter } from "../expressions/handlers";
import { isValidIdentifier } from "../utils/identifier-utils";

export function handleModuleAccess(
  s: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  interpreter: Interpreter,
): number | undefined {
  const trimmed = s.trim();
  const colonIndex = trimmed.indexOf("::");
  const dotIndex = trimmed.indexOf(".");

  // Handle module access with ::
  if (colonIndex !== -1 && (dotIndex === -1 || colonIndex < dotIndex)) {
    const moduleName = trimmed.slice(0, colonIndex).trim();
    const memberStr = trimmed.slice(colonIndex + 2).trim();

    if (!isValidIdentifier(moduleName)) return undefined;

    // Check if module exists
    if (!typeMap.has("__module__" + moduleName)) return undefined;

    const module = getModule(moduleName);
    if (!module) return undefined;

    // Try to resolve the member in module scope
    // Handle both variable access and function calls
    if (memberStr.includes("(")) {
      // Function call: Module::functionName(args)
      // Check visibility before calling
      const fnName = memberStr.slice(0, memberStr.indexOf("(")).trim();
      const isPublic = module.visMap.get(fnName);
      if (!isPublic) {
        throw new Error(
          `member '${fnName}' of module '${moduleName}' is private`,
        );
      }
      // Use module scope for resolution
      const result = interpreter(
        memberStr,
        module.scope,
        module.typeMap,
        module.mutMap,
        new Set(),
        new Set(),
      );
      return result;
    } else {
      // Variable/member access: Module::memberName
      if (!module.scope.has(memberStr)) {
        throw new Error(`module '${moduleName}' has no member '${memberStr}'`);
      }
      // Check visibility for external access
      const isPublic = module.visMap.get(memberStr);
      if (!isPublic) {
        throw new Error(
          `member '${memberStr}' of module '${moduleName}' is private`,
        );
      }
      return module.scope.get(memberStr);
    }
  }

  // Handle object access with .
  if (dotIndex !== -1) {
    const objectName = trimmed.slice(0, dotIndex).trim();
    const memberStr = trimmed.slice(dotIndex + 1).trim();

    if (!isValidIdentifier(objectName)) return undefined;

    // Check if object exists
    if (!typeMap.has("__object__" + objectName)) return undefined;

    const obj = getObject(objectName);
    if (!obj) return undefined;

    // Try to resolve the member in object scope
    // Handle both variable access and function calls
    if (memberStr.includes("(")) {
      // Function call: object.functionName(args)
      // Check visibility before calling
      const fnName = memberStr.slice(0, memberStr.indexOf("(")).trim();
      const isPublic = obj.visMap.get(fnName);
      if (!isPublic) {
        throw new Error(
          `member '${fnName}' of object '${objectName}' is private`,
        );
      }
      // Use object scope for resolution
      const result = interpreter(
        memberStr,
        obj.scope,
        obj.typeMap,
        obj.mutMap,
        new Set(),
        new Set(),
      );
      return result;
    } else {
      // Variable/member access: object.memberName
      if (!obj.scope.has(memberStr)) {
        throw new Error(`object '${objectName}' has no member '${memberStr}'`);
      }
      // Check visibility for external access
      const isPublic = obj.visMap.get(memberStr);
      if (!isPublic) {
        throw new Error(
          `member '${memberStr}' of object '${objectName}' is private`,
        );
      }
      return obj.scope.get(memberStr);
    }
  }

  return undefined;
}
