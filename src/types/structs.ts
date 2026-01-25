import type { Interpreter } from "../expressions/handlers";
import { makeDeclarationHandler } from "../declarations";
import { parseGenericParams } from "../utils/generic-params";

// Global struct instance storage: maps instance ID to {fieldValues, typeParams}
// typeParams maps generic param names to concrete type names (e.g., {T: "I32"})
const structInstances = new Map<
  number,
  { fieldValues: Map<string, number>; typeParams: Map<string, string> }
>();
let nextInstanceId = 1000000; // Start from a high number to avoid conflicts with other values

export interface StructDefinition {
  fields: string[];
  generics?: string[];
}

export const handleStructDeclaration = makeDeclarationHandler(
  "struct",
  (rest: string) => rest.indexOf("}"),
  (
    rest: string,
    closeIndex: number,
    typeMap: Map<string, number>,
    _visMap: Map<string, boolean>,
    _isPublic: boolean,
  ) => {
    const braceIndex = rest.indexOf("{");
    const headerStr = rest.slice(0, braceIndex).trim();
    const { name: structName, params: genericParams } =
      parseGenericParams(headerStr);
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
    // Store generic parameters if any
    if (genericParams.length > 0) {
      typeMap.set(
        "__struct_generics__" + structName,
        genericParams.join(",") as unknown as number,
      );
    }
  },
);

function findStructClosingBrace(trimmed: string, braceIndex: number): number {
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
  return closeIndex;
}

function parseFieldAssignments(
  fieldsStr: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  interpreter: Interpreter,
): Map<string, number> {
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
  return fieldValues;
}

function extractTypeParameters(
  concreteTypes: string[],
  structName: string,
  typeMap: Map<string, number>,
): Map<string, string> {
  const typeParamMap = new Map<string, string>();
  if (concreteTypes.length > 0) {
    const genericParamStr = typeMap.get("__struct_generics__" + structName);
    if (genericParamStr) {
      const genericParams = (genericParamStr as unknown as string)
        .split(",")
        .map((p) => p.trim());
      for (
        let i = 0;
        i < Math.min(genericParams.length, concreteTypes.length);
        i++
      ) {
        const param = genericParams[i];
        const concreteType = concreteTypes[i];
        if (param && concreteType) {
          typeParamMap.set(param, concreteType);
        }
      }
    }
  }
  return typeParamMap;
}

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
  const headerStr = trimmed.slice(0, braceIndex).trim();
  const { name: structName, params: concreteTypes } =
    parseGenericParams(headerStr);
  if (!typeMap.has("__struct__" + structName)) {
    return undefined;
  }
  const closeIndex = findStructClosingBrace(trimmed, braceIndex);
  if (closeIndex === -1) {
    return undefined;
  }
  const fieldsStr = trimmed.slice(braceIndex + 1, closeIndex).trim();
  const fieldValues = parseFieldAssignments(
    fieldsStr,
    scope,
    typeMap,
    interpreter,
  );
  const typeParamMap = extractTypeParameters(
    concreteTypes,
    structName,
    typeMap,
  );
  return createStructInstance(structName, fieldValues, typeParamMap);
}

export function createStructInstance(
  structName: string,
  fieldValues: Map<string, number>,
  typeParams: Map<string, string> = new Map(),
): number {
  const instanceId = nextInstanceId++;
  structInstances.set(instanceId, { fieldValues, typeParams });
  return instanceId;
}

export function getStructField(instanceId: number, fieldName: string): number {
  const instance = structInstances.get(instanceId);
  if (!instance) {
    throw new Error(`invalid struct instance: ${instanceId}`);
  }
  const value = instance.fieldValues.get(fieldName);
  if (value === undefined) {
    throw new Error(
      `struct instance ${instanceId} has no field '${fieldName}'`,
    );
  }
  return value;
}

export function getStructTypeParams(instanceId: number): Map<string, string> {
  const instance = structInstances.get(instanceId);
  if (!instance) return new Map();
  return instance.typeParams;
}

export function isStructInstance(value: number): boolean {
  return value >= 1000000;
}

export function getStructFields(
  instanceId: number,
): Map<string, number> | undefined {
  const instance = structInstances.get(instanceId);
  if (!instance) return undefined;
  return instance.fieldValues;
}
