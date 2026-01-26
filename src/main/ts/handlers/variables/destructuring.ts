import { getStructFields, isStructInstance } from "../../types/structs";
import type { ScopeContext } from "../../types/interpreter";
import { callInterpreter } from "../../types/interpreter";

function parseDestructuringFieldNames(pattern: string): string[] {
  return pattern
    .slice(1, -1)
    .trim()
    .split(",")
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

function validateAndExtractStructFields(
  structValue: number,
): Map<string, number> {
  if (!isStructInstance(structValue)) {
    throw new Error(`cannot destructure non-struct value`);
  }
  const structFields = getStructFields(structValue);
  if (!structFields) {
    throw new Error(`invalid struct instance`);
  }
  return structFields;
}

function assignDestructuredFields(
  fieldNames: string[],
  structFields: Map<string, number>,
  isPublic: boolean,
  isMut: boolean,
  scope: Map<string, number>,
  mutMap: Map<string, boolean>,
  visMap: Map<string, boolean>,
): void {
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
}

export function handleDestructuring(
  pattern: string,
  exprStr: string,
  isPublic: boolean,
  isMut: boolean,
  ctx: ScopeContext,
): number {
  const fieldNames = parseDestructuringFieldNames(pattern);
  const structValue = callInterpreter(ctx, exprStr);
  const structFields = validateAndExtractStructFields(structValue);
  assignDestructuredFields(
    fieldNames,
    structFields,
    isPublic,
    isMut,
    ctx.scope,
    ctx.mutMap,
    ctx.visMap,
  );
  return structValue;
}

export function isDestructuringPattern(varName: string): boolean {
  return varName.startsWith("{") && varName.endsWith("}");
}
