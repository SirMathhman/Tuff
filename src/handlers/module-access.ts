import { getModule } from "../types/modules";
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

  if (colonIndex === -1) return undefined;

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
    return module.scope.get(memberStr);
  }
}
