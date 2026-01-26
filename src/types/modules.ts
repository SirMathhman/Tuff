import type { Interpreter } from "../expressions/handlers";
import { createNamespacedDeclarationHandler } from "./namespace-handler";

export type NamespacedStoreEntry = {
  scope: Map<string, number>;
  typeMap: Map<string, number>;
  mutMap: Map<string, boolean>;
  visMap: Map<string, boolean>;
};

export function createNamespacedStore(): Map<string, NamespacedStoreEntry> {
  return new Map<string, NamespacedStoreEntry>();
}

// Global module storage: maps module name to its scope
const modules = createNamespacedStore();

export function getModule(name: string): NamespacedStoreEntry | undefined {
  return modules.get(name);
}

export function setModule(
  name: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  visMap: Map<string, boolean>,
): void {
  modules.set(name, { scope, typeMap, mutMap, visMap });
}

export function getModuleDeclarationHandler(interpreter: Interpreter) {
  return createNamespacedDeclarationHandler(
    "module",
    (name: string) => "__module__" + name,
    { get: getModule, set: setModule },
    interpreter,
  );
}
