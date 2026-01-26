import type { Interpreter } from "../expressions/handlers";
import { createNamespacedDeclarationHandler } from "./namespace-handler";
import {
  createNamespacedSetter,
  createNamespacedStore,
  type NamespacedStoreEntry,
} from "./modules";

// Global object storage: maps object name to its scope
const objects = createNamespacedStore();

export function getObject(name: string): NamespacedStoreEntry | undefined {
  return objects.get(name);
}

export const setObject = createNamespacedSetter(objects);

export function getObjectDeclarationHandler(interpreter: Interpreter) {
  return createNamespacedDeclarationHandler(
    "object",
    (name: string) => "__object__" + name,
    { get: getObject, set: setObject },
    interpreter,
  );
}
