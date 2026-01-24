import type { Interpreter } from "../expressions/handlers";
import { makeDeclarationHandler } from "../declarations";
import { isValidIdentifier } from "../utils/identifier-utils";

// Global module storage: maps module name to its scope
const modules = new Map<
  string,
  {
    scope: Map<string, number>;
    typeMap: Map<string, number>;
    mutMap: Map<string, boolean>;
  }
>();

export function getModule(name: string):
  | {
      scope: Map<string, number>;
      typeMap: Map<string, number>;
      mutMap: Map<string, boolean>;
    }
  | undefined {
  return modules.get(name);
}

export function setModule(
  name: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
): void {
  modules.set(name, { scope, typeMap, mutMap });
}

function createModuleHandler(interpreter: Interpreter) {
  return makeDeclarationHandler(
    "module",
    (rest: string) => {
      const braceIndex = rest.indexOf("{");
      if (braceIndex === -1) return -1;
      let braceDepth = 0;
      for (let i = braceIndex; i < rest.length; i++) {
        if (rest[i] === "{") braceDepth++;
        else if (rest[i] === "}") {
          braceDepth--;
          if (braceDepth === 0) return i;
        }
      }
      return -1;
    },
    (rest: string, closeIndex: number, typeMap: Map<string, number>) => {
      const braceIndex = rest.indexOf("{");
      if (braceIndex === -1) return;

      const moduleName = rest.slice(0, braceIndex).trim();
      if (!isValidIdentifier(moduleName)) return;

      const moduleBody = rest.slice(braceIndex + 1, closeIndex).trim();

      // Create module scope and execute body to populate it
      const moduleScope = new Map<string, number>();
      const moduleTypeMap = new Map<string, number>();
      const moduleMutMap = new Map<string, boolean>();

      interpreter(
        moduleBody,
        moduleScope,
        moduleTypeMap,
        moduleMutMap,
        new Set(),
        new Set(),
      );

      // Store module for later access
      setModule(moduleName, moduleScope, moduleTypeMap, moduleMutMap);
      typeMap.set("__module__" + moduleName, 1);
    },
  );
}

export function getModuleDeclarationHandler(interpreter: Interpreter) {
  return createModuleHandler(interpreter);
}
