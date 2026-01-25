import type { Interpreter } from "../../expressions/handlers";
import { getStructFields, isStructInstance } from "../../types/structs";

export function handleDestructuring(
  pattern: string,
  exprStr: string,
  isPublic: boolean,
  isMut: boolean,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  visMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
  interpreter: Interpreter,
): number {
  // Parse destructuring pattern: { field1, field2, ... }
  const fieldNames = pattern
    .slice(1, -1)
    .trim()
    .split(",")
    .map((f) => f.trim())
    .filter((f) => f.length > 0);

  // Evaluate the struct value
  const structValue = interpreter(
    exprStr,
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    visMap,
  );

  // Verify it's a struct instance
  if (!isStructInstance(structValue)) {
    throw new Error(`cannot destructure non-struct value`);
  }

  // Get struct fields
  const structFields = getStructFields(structValue);
  if (!structFields) {
    throw new Error(`invalid struct instance`);
  }

  // Assign each field to its own variable
  for (const fieldName of fieldNames) {
    if (scope.has(fieldName)) {
      throw new Error(`variable '${fieldName}' already declared`);
    }

    const fieldValue = structFields.get(fieldName);
    if (fieldValue === undefined) {
      throw new Error(`struct has no field '${fieldName}'`);
    }

    scope.set(fieldName, fieldValue);
    if (isMut) {
      mutMap.set(fieldName, true);
    }
    visMap.set(fieldName, isPublic);
  }

  return structValue;
}

export function isDestructuringPattern(varName: string): boolean {
  return varName.startsWith("{") && varName.endsWith("}");
}
