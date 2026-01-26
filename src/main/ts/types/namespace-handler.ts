import type { Interpreter } from "../expressions/handlers";
import { makeDeclarationHandler, type StoreDecl } from "../declarations";
import { isValidIdentifier } from "../utils/identifier-utils";
import type { NamespacedSetter, NamespacedStoreEntry } from "./namespaced";
import { findMatchingCloseBrace } from "../utils/helpers/brace-utils";

function findBraceClose(rest: string): number {
  const braceIndex = rest.indexOf("{");
  if (braceIndex === -1) return -1;
  return findMatchingCloseBrace(rest, braceIndex);
}

function createAndPopulateEntityScope(
  entityBody: string,
  interpreter: Interpreter,
): {
  entityScope: Map<string, number>;
  entityTypeMap: Map<string, number>;
  entityMutMap: Map<string, boolean>;
  entityVisMap: Map<string, boolean>;
} {
  const entityScope = new Map<string, number>();
  const entityTypeMap = new Map<string, number>();
  const entityMutMap = new Map<string, boolean>();
  const entityVisMap = new Map<string, boolean>();
  interpreter(
    entityBody,
    entityScope,
    entityTypeMap,
    entityMutMap,
    new Set(),
    new Set(),
    entityVisMap,
  );
  return { entityScope, entityTypeMap, entityMutMap, entityVisMap };
}

export function createNamespacedDeclarationHandler(
  keyword: string,
  namespacer: (name: string) => string,
  storage: {
    get: (name: string) => NamespacedStoreEntry | undefined;
    set: NamespacedSetter;
  },
  interpreter: Interpreter,
) {
  const storeNamespacedDeclaration: StoreDecl = (rest, closeIndex, typeMap) => {
    const braceIndex = rest.indexOf("{");
    if (braceIndex === -1) return;
    const entityName = rest.slice(0, braceIndex).trim();
    if (!isValidIdentifier(entityName)) return;
    const entityBody = rest.slice(braceIndex + 1, closeIndex).trim();
    const { entityScope, entityTypeMap, entityMutMap, entityVisMap } =
      createAndPopulateEntityScope(entityBody, interpreter);
    storage.set(
      entityName,
      entityScope,
      entityTypeMap,
      entityMutMap,
      entityVisMap,
    );
    typeMap.set(namespacer(entityName), 1);
  };

  return makeDeclarationHandler(
    keyword,
    findBraceClose,
    storeNamespacedDeclaration,
  );
}
