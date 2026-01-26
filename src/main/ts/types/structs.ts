import type { Interpreter } from "../expressions/handlers";
import { makeDeclarationHandler, type StoreDecl } from "../declarations";
import { parseGenericParams } from "../utils/generic-params";
import { inferValueType } from "../utils/generics/type-inference";
import { parseFieldsDefinition } from "../compiler/parsing/field-parsing";
import { throwFieldTypeMismatch } from "../compiler/transforms/error-helpers";

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

const storeStructDeclaration: StoreDecl = (rest, closeIndex, typeMap) => {
  const braceIndex = rest.indexOf("{");
  const headerStr = rest.slice(0, braceIndex).trim();
  const { name: structName, params: genericParams } =
    parseGenericParams(headerStr);
  const fieldsStr = rest.slice(braceIndex + 1, closeIndex).trim();

  // Store struct definition
  typeMap.set("__struct__" + structName, fieldsStr.length as unknown as number);
  // Store field names as a comma-separated string
  typeMap.set("__struct_fields__" + structName, fieldsStr as unknown as number);
  // Store generic parameters if any
  if (genericParams.length > 0) {
    typeMap.set(
      "__struct_generics__" + structName,
      genericParams.join(",") as unknown as number,
    );
  }
};

export const handleStructDeclaration = makeDeclarationHandler(
  "struct",
  (rest: string) => rest.indexOf("}"),
  storeStructDeclaration,
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

function evaluateStructField(
  fieldName: string,
  valueStr: string,
  fieldTypes: Map<string, string> | undefined,
  typeParamMap: Map<string, string> | undefined,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  interpreter: Interpreter,
): number {
  // Validate type if provided
  if (fieldTypes && typeParamMap && typeParamMap.size > 0) {
    const fieldTypeStr = fieldTypes.get(fieldName);
    if (fieldTypeStr) {
      const resolvedType = typeParamMap.get(fieldTypeStr) || fieldTypeStr;
      const firstChar = resolvedType[0];
      const isIntType =
        (firstChar === "I" || firstChar === "U") && resolvedType[1];
      const isBoolType = resolvedType === "Bool";
      if (isIntType || isBoolType) {
        const inferredType = inferValueType(valueStr);
        if (
          inferredType &&
          inferredType !== resolvedType &&
          !(
            (resolvedType.startsWith("I") || resolvedType.startsWith("U")) &&
            (inferredType.startsWith("I") || inferredType.startsWith("U"))
          )
        ) {
          throwFieldTypeMismatch(fieldName, resolvedType, inferredType);
        }
      }
    }
  }

  // Evaluate field value
  return interpreter(valueStr, scope, typeMap, new Map(), new Set(), new Set());
}

function parseFieldAssignments(
  fieldsStr: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  interpreter: Interpreter,
  structName?: string,
  typeParamMap?: Map<string, string>,
): Map<string, number> {
  const fieldAssignments = fieldsStr
    .split(",")
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
  const fieldValues = new Map<string, number>();

  // Get struct field definitions if we need to validate types
  let fieldTypes: Map<string, string> | undefined;
  if (structName && typeParamMap && typeParamMap.size > 0) {
    const fieldDefsStr = typeMap.get(
      "__struct_fields__" + structName,
    ) as unknown as string;
    if (fieldDefsStr) {
      fieldTypes = parseFieldsDefinition(fieldDefsStr);
    }
  }

  for (const assignment of fieldAssignments) {
    const colonIndex = assignment.indexOf(":");
    if (colonIndex === -1) {
      throw new Error(`invalid struct field assignment: ${assignment}`);
    }
    const fieldName = assignment.slice(0, colonIndex).trim();
    const valueStr = assignment.slice(colonIndex + 1).trim();

    const value = evaluateStructField(
      fieldName,
      valueStr,
      fieldTypes,
      typeParamMap,
      scope,
      typeMap,
      interpreter,
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
  const typeParamMap = extractTypeParameters(
    concreteTypes,
    structName,
    typeMap,
  );
  const fieldValues = parseFieldAssignments(
    fieldsStr,
    scope,
    typeMap,
    interpreter,
    structName,
    typeParamMap,
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
