import type { Interpreter } from "../expressions/handlers";
import { createNamespacedDeclarationHandler } from "./namespace-handler";
import {
  createNamespacedStore,
  type NamespacedStoreEntry,
} from "./modules";

// Global object storage: maps object name to its scope
const objects = createNamespacedStore();

export function getObject(name: string): NamespacedStoreEntry | undefined {
  return objects.get(name);
}

export function setObject(
  name: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  visMap: Map<string, boolean>,
): void {
  objects.set(name, { scope, typeMap, mutMap, visMap });
}

export function getObjectDeclarationHandler(interpreter: Interpreter) {
  return createNamespacedDeclarationHandler(
    "object",
    (name: string) => "__object__" + name,
    { get: getObject, set: setObject },
    interpreter,
  );
}
