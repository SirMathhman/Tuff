import type { Interpreter } from "../expressions/handlers";
import { createNamespacedDeclarationHandler } from "./namespace-handler";

// Global object storage: maps object name to its scope
const objects = new Map<
  string,
  {
    scope: Map<string, number>;
    typeMap: Map<string, number>;
    mutMap: Map<string, boolean>;
  }
>();

export function getObject(name: string):
  | {
      scope: Map<string, number>;
      typeMap: Map<string, number>;
      mutMap: Map<string, boolean>;
    }
  | undefined {
  return objects.get(name);
}

export function setObject(
  name: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
): void {
  objects.set(name, { scope, typeMap, mutMap });
}

export function getObjectDeclarationHandler(interpreter: Interpreter) {
  return createNamespacedDeclarationHandler(
    "object",
    (name: string) => "__object__" + name,
    { get: getObject, set: setObject },
    interpreter,
  );
}
