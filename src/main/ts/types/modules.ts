import type { Interpreter } from "../expressions/handlers";
import { createNamespacedDeclarationHandler } from "./namespace-handler";

import type { NamespacedSetter, NamespacedStoreEntry } from "./namespaced";

export type { NamespacedSetter, NamespacedStoreEntry };

export function createNamespacedStore(): Map<string, NamespacedStoreEntry> {
  return new Map<string, NamespacedStoreEntry>();
}

// Global module storage: maps module name to its scope
const modules = createNamespacedStore();

export function getModule(name: string): NamespacedStoreEntry | undefined {
  return modules.get(name);
}

export function createNamespacedSetter(
  store: Map<string, NamespacedStoreEntry>,
): NamespacedSetter {
  return (name, scope, typeMap, mutMap, visMap): void => {
    store.set(name, { scope, typeMap, mutMap, visMap });
  };
}

export const setModule = createNamespacedSetter(modules);

export function getModuleDeclarationHandler(interpreter: Interpreter) {
  return createNamespacedDeclarationHandler(
    "module",
    (name: string) => "__module__" + name,
    { get: getModule, set: setModule },
    interpreter,
  );
}
