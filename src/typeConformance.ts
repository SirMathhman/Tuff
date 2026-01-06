import { InterpretError, Value } from "./types";

type LookupType = (name: string) => string[] | undefined;

function isStructInstance(value: Value): value is Map<string, number> {
  return typeof value === "object" && value instanceof Map;
}

export function checkTypeConformance(
  typeName: string,
  value: Value,
  lookupType: LookupType
): InterpretError | undefined {
  // named primitive types
  if (typeName === "Bool") {
    if (typeof value !== "number" || !(value === 0 || value === 1)) {
      return {
        type: "InvalidInput",
        message: "Type mismatch: expected Bool",
      };
    }
    return undefined;
  }
  if (typeName === "I32") {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      return { type: "InvalidInput", message: "Type mismatch: expected I32" };
    }
    return undefined;
  }

  // user-defined struct types
  const typeDef = lookupType(typeName);
  if (typeDef !== undefined) {
    if (!isStructInstance(value)) {
      return {
        type: "InvalidInput",
        message: `Type mismatch: expected ${typeName}`,
      };
    }
    // check all fields exist and are numeric
    for (let i = 0; i < typeDef.length; i++) {
      const f = typeDef[i];
      const v = value.get(f);
      if (typeof v !== "number") {
        return {
          type: "InvalidInput",
          message: `Type mismatch: expected ${typeName}`,
        };
      }
    }
    return undefined;
  }

  return { type: "InvalidInput", message: `Unknown type: ${typeName}` };
}
