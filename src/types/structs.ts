import type { Interpreter } from "../expressions/handlers";
import { makeDeclarationHandler } from "../declarations";

// Global struct instance storage: maps instance ID to field values
// Each struct instance is a Map<fieldName, value>
const structInstances = new Map<number, Map<string, number>>();
let nextInstanceId = 1000000; // Start from a high number to avoid conflicts with other values

export interface StructDefinition {
  fields: string[];
}

export const handleStructDeclaration = makeDeclarationHandler(
  "struct",
  (rest: string) => rest.indexOf("}"),
  (rest: string, closeIndex: number, typeMap: Map<string, number>) => {
    const braceIndex = rest.indexOf("{");
    const structName = rest.slice(0, braceIndex).trim();
    const fieldsStr = rest.slice(braceIndex + 1, closeIndex).trim();

    // Store struct definition
    typeMap.set(
      "__struct__" + structName,
      fieldsStr.length as unknown as number,
    );
    // Store field names as a comma-separated string
    typeMap.set(
      "__struct_fields__" + structName,
      fieldsStr as unknown as number,
    );
  },
);

export function parseStructInstantiation(
  s: string,
  typeMap: Map<string, number>,
  scope: Map<string, number>,
  interpreter: Interpreter,
): number | undefined {
  const trimmed = s.trim();
  const braceIndex = trimmed.indexOf("{");
  if (braceIndex === -1) {
    return undefined;
  }

  const structName = trimmed.slice(0, braceIndex).trim();
  if (!typeMap.has("__struct__" + structName)) {
    return undefined;
  }

  // Find the closing brace, accounting for nested braces in field values
  let closeIndex = -1;
  let braceDepth = 0;
  for (let i = braceIndex; i < trimmed.length; i++) {
    if (trimmed[i] === "{") braceDepth++;
    else if (trimmed[i] === "}") {
      braceDepth--;
      if (braceDepth === 0) {
        closeIndex = i;
        break;
      }
    }
  }

  if (closeIndex === -1) {
    return undefined;
  }

  const fieldsStr = trimmed.slice(braceIndex + 1, closeIndex).trim();
  const fieldAssignments = fieldsStr
    .split(",")
    .map((f) => f.trim())
    .filter((f) => f.length > 0);

  const fieldValues = new Map<string, number>();

  for (const assignment of fieldAssignments) {
    const colonIndex = assignment.indexOf(":");
    if (colonIndex === -1) {
      throw new Error(`invalid struct field assignment: ${assignment}`);
    }

    const fieldName = assignment.slice(0, colonIndex).trim();
    const valueStr = assignment.slice(colonIndex + 1).trim();

    // Parse the value
    const value = interpreter(
      valueStr,
      scope,
      typeMap,
      new Map(),
      new Set(),
      new Set(),
    );

    fieldValues.set(fieldName, value);
  }

  return createStructInstance(structName, fieldValues);
}

export function createStructInstance(
  structName: string,
  fieldValues: Map<string, number>,
): number {
  const instanceId = nextInstanceId++;
  structInstances.set(instanceId, fieldValues);
  return instanceId;
}

export function getStructField(instanceId: number, fieldName: string): number {
  const instance = structInstances.get(instanceId);
  if (!instance) {
    throw new Error(`invalid struct instance: ${instanceId}`);
  }
  const value = instance.get(fieldName);
  if (value === undefined) {
    throw new Error(
      `struct instance ${instanceId} has no field '${fieldName}'`,
    );
  }
  return value;
}

export function isStructInstance(value: number): boolean {
  return value >= 1000000;
}
