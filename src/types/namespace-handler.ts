import type { Interpreter } from "../expressions/handlers";
import { makeDeclarationHandler } from "../declarations";
import { isValidIdentifier } from "../utils/identifier-utils";

function findBraceClose(rest: string): number {
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
}

export function createNamespacedDeclarationHandler(
  keyword: string,
  namespacer: (name: string) => string,
  storage: {
    get: (name: string) =>
      | {
          scope: Map<string, number>;
          typeMap: Map<string, number>;
          mutMap: Map<string, boolean>;
          visMap: Map<string, boolean>;
        }
      | undefined;
    set: (
      name: string,
      scope: Map<string, number>,
      typeMap: Map<string, number>,
      mutMap: Map<string, boolean>,
      visMap: Map<string, boolean>,
    ) => void;
  },
  interpreter: Interpreter,
) {
  return makeDeclarationHandler(
    keyword,
    findBraceClose,
    (
      rest: string,
      closeIndex: number,
      typeMap: Map<string, number>,
      _visMap: Map<string, boolean>,
      _isPublic: boolean,
    ) => {
      const braceIndex = rest.indexOf("{");
      if (braceIndex === -1) return;

      const entityName = rest.slice(0, braceIndex).trim();
      if (!isValidIdentifier(entityName)) return;

      const entityBody = rest.slice(braceIndex + 1, closeIndex).trim();

      // Create entity scope and execute body to populate it
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

      // Store entity for later access
      storage.set(
        entityName,
        entityScope,
        entityTypeMap,
        entityMutMap,
        entityVisMap,
      );
      typeMap.set(namespacer(entityName), 1);
    },
  );
}
