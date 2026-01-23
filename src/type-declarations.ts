import { extractTypeSize } from "./types";
import type { Interpreter } from "./expressions/handlers";

function handleTypeDeclarationEnd(
  rest: string,
  semiIndex: number,
  typeMap: Map<string, number>,
  scope: Map<string, number>,
  mutMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
  interpreter: Interpreter,
): number {
  const afterDecl = rest.slice(semiIndex + 1).trim();
  if (afterDecl) {
    return interpreter(
      afterDecl,
      scope,
      typeMap,
      mutMap,
      uninitializedSet,
      unmutUninitializedSet,
    );
  }
  return 0;
}

export function handleTypeDeclaration(
  input: string,
  typeMap: Map<string, number>,
  scope: Map<string, number>,
  mutMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
  interpreter: Interpreter,
): { handled: boolean; result: number } {
  const s = input.trim();

  if (!s.startsWith("type ")) {
    return { handled: false, result: 0 };
  }

  const rest = s.slice(5).trim();
  const semiIndex = rest.indexOf(";");
  if (semiIndex === -1) {
    return { handled: false, result: 0 };
  }

  const declStr = rest.slice(0, semiIndex);
  const eqIndex = declStr.indexOf("=");
  if (eqIndex === -1) {
    return { handled: false, result: 0 };
  }

  const aliasName = declStr.slice(0, eqIndex).trim();
  const aliasType = declStr.slice(eqIndex + 1).trim();

  // Check if it's a union type (contains |)
  if (aliasType.includes("|")) {
    const unionTypes = aliasType
      .split("|")
      .map((t) => t.trim())
      .map((t) => {
        let size = extractTypeSize(t);
        // If it's an alias to another alias, resolve it
        if (size === 0 && typeMap.has("__alias__" + t)) {
          size = typeMap.get("__alias__" + t) || 0;
        }
        // If it's an alias to a union, resolve it
        if (size === 0 && typeMap.has("__union__" + t)) {
          size = typeMap.get("__union__" + t) || 0;
        }
        return size;
      });

    // Check if all types were resolved
    if (unionTypes.length > 0 && !unionTypes.includes(0)) {
      // Store the union as a comma-separated list of type sizes
      const unionStr = unionTypes.join(",");
      typeMap.set("__union__" + aliasName, unionStr as unknown as number);

      return {
        handled: true,
        result: handleTypeDeclarationEnd(
          rest,
          semiIndex,
          typeMap,
          scope,
          mutMap,
          uninitializedSet,
          unmutUninitializedSet,
          interpreter,
        ),
      };
    }
  } else {
    // Regular type alias
    let typeSize = extractTypeSize(aliasType);

    // If it's an alias to another alias, resolve it
    if (typeSize === 0 && typeMap.has("__alias__" + aliasType)) {
      typeSize = typeMap.get("__alias__" + aliasType) || 0;
    }

    if (typeSize > 0) {
      // Store the alias
      typeMap.set("__alias__" + aliasName, typeSize);

      return {
        handled: true,
        result: handleTypeDeclarationEnd(
          rest,
          semiIndex,
          typeMap,
          scope,
          mutMap,
          uninitializedSet,
          unmutUninitializedSet,
          interpreter,
        ),
      };
    }
  }

  return { handled: false, result: 0 };
}
