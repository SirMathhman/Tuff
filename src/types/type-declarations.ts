import { extractTypeSize } from "../type-utils";
import { makeDeclarationHandler } from "../declarations";

export const handleTypeDeclaration = makeDeclarationHandler(
  "type",
  (rest: string) => rest.indexOf(";"),
  (
    rest: string,
    closeIndex: number,
    typeMap: Map<string, number>,
    _visMap: Map<string, boolean>,
    _isPublic: boolean,
  ) => {
    const declStr = rest.slice(0, closeIndex);
    const eqIndex = declStr.indexOf("=");
    if (eqIndex === -1) return;

    const aliasName = declStr.slice(0, eqIndex).trim();
    const aliasType = declStr. slice(eqIndex + 1).trim();

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
      }
    }
  },
);
