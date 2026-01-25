import { functionDefs } from "../functions";
import { getArrayMetadata, isArrayInstance } from "../utils/array";
import type { Interpreter } from "./handlers";

function extractArrayElementType(arrayTypeStr: string): string | undefined {
  // Array type format: [ElementType; initialized; capacity]
  if (!arrayTypeStr.startsWith("[") || !arrayTypeStr.includes("]")) {
    return undefined;
  }
  
  const inner = arrayTypeStr.slice(1, arrayTypeStr.lastIndexOf("]")).trim();
  const parts = inner.split(";");
  
  if (parts.length !== 3) return undefined;
  
  return parts[0]?.trim();
}

function executeDropHandler(
  dropFuncName: string,
  paramValue: number,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  interpreter: Interpreter,
): void {
  const fnDef = functionDefs.get(dropFuncName);
  if (fnDef && fnDef.params.length === 1) {
    const paramName = fnDef.params[0]!.name;
    const dropScope = new Map(scope);
    dropScope.set(paramName, paramValue);
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
      const typeNameValue = cTypeMap.get(typeNameKey) || typeMap.get(typeNameKey);
      const typeName = typeof typeNameValue === "string" ? typeNameValue : (typeNameValue as unknown as string);
      if (typeName) {
        // Check if this is an array type
        if (typeName.includes("[") && typeName.includes("]")) {
          // Handle array element destructors
          const elementType = extractArrayElementType(typeName);
          if (elementType && isArrayInstance(varValue)) {
            const arrayMetadata = getArrayMetadata(varValue);
            if (arrayMetadata) {
              // Call drop handler for each initialized element
              const dropKey = "__drop__" + elementType;
              const dropFuncName = (cTypeMap.get(dropKey) ||
                typeMap.get(dropKey)) as unknown as string;
              if (dropFuncName) {
                for (let i = 0; i < arrayMetadata.initialized; i++) {
                  const elementValue = arrayMetadata.values[i]!;
                  executeDropHandler(
                    dropFuncName,
                    elementValue,
                    scope,
                    typeMap,
                    mutMap,
                    interpreter,
                  );
                }
              }
            }
          }
        } else {
          // Handle regular variable destructors
          const dropKey = "__drop__" + typeName;
          const dropFuncName = (cTypeMap.get(dropKey) ||
            typeMap.get(dropKey)) as unknown as string;
          if (dropFuncName) {
            executeDropHandler(
              dropFuncName,
              varValue,
              scope,
              typeMap,
              mutMap,
              interpreter,
            );
          }
        }
      }
    }
  }
}
