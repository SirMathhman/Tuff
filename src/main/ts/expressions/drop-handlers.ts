import { functionDefs } from "../functions";
import { getArrayMetadata, isArrayInstance } from "../utils/array";
import { getStructFields, isStructInstance } from "../types/structs";
import type { Interpreter } from "./handlers";
import {
  extractArrayElementType,
  parseStructFieldTypes,
  getDropFuncName,
  getTypeNameForVar,
} from "./drop-helpers";

type DropCtx = {
  cTypeMap: Map<string, number>;
  typeMap: Map<string, number>;
  scope: Map<string, number>;
  mutMap: Map<string, boolean>;
  interpreter: Interpreter;
};

function executeDropHandler(
  dropFuncName: string,
  paramValue: number,
  ctx: DropCtx,
): void {
  const fnDef = functionDefs.get(dropFuncName);
  if (fnDef && fnDef.params.length === 1) {
    const paramName = fnDef.params[0]!.name;
    const dropScope = new Map(ctx.scope);
    dropScope.set(paramName, paramValue);
    ctx.interpreter(
      fnDef.body,
      dropScope,
      ctx.typeMap,
      ctx.mutMap,
      new Set(),
      new Set(),
      new Map(),
    );
    for (const [k, v] of dropScope.entries()) {
      if (ctx.scope.has(k)) ctx.scope.set(k, v);
    }
  }
}

function handleArrayDropHandlers(
  typeName: string,
  varValue: number,
  ctx: DropCtx,
): void {
  const elementType = extractArrayElementType(typeName);
  if (elementType && isArrayInstance(varValue)) {
    const arrayMetadata = getArrayMetadata(varValue);
    if (arrayMetadata) {
      const dropFuncName = getDropFuncName(
        "__drop__" + elementType,
        ctx.cTypeMap,
        ctx.typeMap,
      );
      if (dropFuncName) {
        for (let i = 0; i < arrayMetadata.initialized; i++) {
          executeDropHandler(dropFuncName, arrayMetadata.values[i]!, ctx);
        }
      }
    }
  }
}

function handleStructFieldDropHandlers(
  typeName: string,
  varValue: number,
  ctx: DropCtx,
): void {
  const structFieldsStr = getDropFuncName(
    "__struct_fields__" + typeName,
    ctx.cTypeMap,
    ctx.typeMap,
  );
  if (structFieldsStr) {
    const fieldTypes = parseStructFieldTypes(structFieldsStr);
    const fieldValues = getStructFields(varValue);
    if (fieldTypes && fieldValues) {
      for (const [fieldName, fieldType] of fieldTypes.entries()) {
        const fieldValue = fieldValues.get(fieldName);
        if (fieldValue !== undefined) {
          const dropFuncName = getDropFuncName(
            "__drop__" + fieldType,
            ctx.cTypeMap,
            ctx.typeMap,
          );
          if (dropFuncName) executeDropHandler(dropFuncName, fieldValue, ctx);
        }
      }
    }
  }
}

function handleStructDropHandler(
  typeName: string,
  varValue: number,
  ctx: DropCtx,
): void {
  handleStructFieldDropHandlers(typeName, varValue, ctx);
  const dropFuncName = getDropFuncName(
    "__drop__" + typeName,
    ctx.cTypeMap,
    ctx.typeMap,
  );
  if (dropFuncName) executeDropHandler(dropFuncName, varValue, ctx);
}

function handleRegularDropHandler(
  typeName: string,
  varValue: number,
  ctx: DropCtx,
): void {
  const dropFuncName = getDropFuncName(
    "__drop__" + typeName,
    ctx.cTypeMap,
    ctx.typeMap,
  );
  if (dropFuncName) executeDropHandler(dropFuncName, varValue, ctx);
}

function handleVariableDropByType(
  typeName: string,
  varValue: number,
  ctx: DropCtx,
): void {
  if (typeName.includes("[") && typeName.includes("]")) {
    handleArrayDropHandlers(typeName, varValue, ctx);
  } else if (isStructInstance(varValue)) {
    handleStructDropHandler(typeName, varValue, ctx);
  } else {
    handleRegularDropHandler(typeName, varValue, ctx);
  }
}

export function executeDropHandlers(
  cScope: Map<string, number>,
  scope: Map<string, number>,
  cTypeMap: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  interpreter: Interpreter,
): void {
  const ctx: DropCtx = { cTypeMap, typeMap, scope, mutMap, interpreter };
  for (const [varName, varValue] of cScope.entries()) {
    if (!scope.has(varName)) {
      const typeName = getTypeNameForVar(varName, cTypeMap, typeMap);
      if (typeName) handleVariableDropByType(typeName, varValue, ctx);
    }
  }
}
