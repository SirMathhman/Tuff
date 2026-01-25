import { functionDefs } from "../functions";
import type { Interpreter } from "./handlers";

export function executeDropHandlers(
  cScope: Map<string, number>,
  scope: Map<string, number>,
  cTypeMap: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  interpreter: Interpreter,
): void {
  // Call drop handlers for variables going out of scope
  for (const [varName, varValue] of cScope.entries()) {
    if (!scope.has(varName)) {
      // Variable was declared in inner scope, check for drop handler
      const typeNameKey = "__vartype__" + varName;
      const typeName = cTypeMap.get(typeNameKey) as unknown as string;
      if (typeName) {
        const dropKey = "__drop__" + typeName;
        const dropFuncName = (cTypeMap.get(dropKey) ||
          typeMap.get(dropKey)) as unknown as string;
        if (dropFuncName) {
          // Get the function definition and execute its body directly
          const fnDef = functionDefs.get(dropFuncName);
          if (fnDef && fnDef.params.length === 1) {
            // Execute function body with parameter substituted
            const paramName = fnDef.params[0]!.name;
            const dropScope = new Map(scope);
            dropScope.set(paramName, varValue);
            interpreter(
              fnDef.body,
              dropScope,
              typeMap,
              mutMap,
              new Set(),
              new Set(),
              new Map(),
            );
            // Merge changes back
            for (const [k, v] of dropScope.entries()) {
              if (scope.has(k)) {
                scope.set(k, v);
              }
            }
          }
        }
      }
    }
  }
}
