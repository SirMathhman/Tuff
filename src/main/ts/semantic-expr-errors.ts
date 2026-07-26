import type {
  Result,
  CompileError,
  Expression,
  StructField,
  StructDef,
} from "./types";
import { errResult } from "./semantic-errors";
import {
  parseGenericTypeName,
  parseTupleTypeString,
  isTupleType,
  getTupleElementType,
} from "./semantic-generics";

function typeMismatch(
  actual: string | undefined,
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> {
  return {
    isOk: false,
    error: {
      message:
        "Type mismatch: got '" +
        (actual || "unknown") +
        "' but expected 'Bool'",
      reason:
        actual === "Bool"
          ? "! requires a Bool operand"
          : "&& and || require Bool operands",
      suggestedFix: "Use a Bool value.",
      line: loc.line,
      column: loc.column,
    },
  };
}

function checkBoolOperand(
  result: string | undefined,
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> | null {
  if (result === "Bool") return null;
  return typeMismatch(result, loc);
}

function checkLiteralExpr(
  expr: Expression,
): Result<string | undefined, CompileError> | null {
  if (expr.type === "NumberLiteral")
    return { isOk: true, value: (expr as { typeName?: string }).typeName };
  if (expr.type === "BooleanLiteral") return { isOk: true, value: "Bool" };
  if (expr.type === "StringLiteral") return { isOk: true, value: "Str" };
  return null;
}

function checkStructFieldRef(
  objType: string,
  field: string,
  structs: StructDef[],
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> | null {
  const structDef = structs.find((s) => s.name === objType);
  if (!structDef) return null;
  const fieldDef = structDef.fields.find((f) => f.name === field);
  if (!fieldDef) {
    return {
      isOk: false,
      error: {
        message:
          "Unknown field '" + field + "' on struct '" + structDef.name + "'",
        reason: "Field does not exist on struct.",
        suggestedFix: "Use a valid field name.",
        line: loc.line,
        column: loc.column,
      },
    };
  }
  return { isOk: true, value: fieldDef.typeName };
}

function checkStrFieldErr(
  field: string,
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> {
  return {
    isOk: false,
    error: {
      message: "Unknown field '" + field + "' on type 'Str'",
      reason: "String type only supports the .length property.",
      suggestedFix: "Use .length to get the string length.",
      line: loc.line,
      column: loc.column,
    },
  };
}

function checkPrimMemberErr(
  objNodeType: string,
  field: string,
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> {
  const typeLabel = objNodeType === "NumberLiteral" ? "number" : "boolean";
  return {
    isOk: false,
    error: {
      message:
        "Cannot access field '" + field + "' on a " + typeLabel + " literal",
      reason: "Only struct types and Str support member access.",
      suggestedFix: "Use a struct or string value.",
      line: loc.line,
      column: loc.column,
    },
  };
}

function checkTupleMemberExpr(
  objType: string,
  field: string,
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> | null {
  if (!isTupleType(objType)) return null;
  const idx = parseInt(field, 10);
  if (isNaN(idx) || idx < 0)
    return errResult(
      "Invalid tuple index '" + field + "'",
      "Tuple indices must be non-negative integers.",
      "Use a numeric index like .0, .1",
      loc.line,
      loc.column,
    );
  const elemType = getTupleElementType(objType, idx);
  if (!elemType)
    return errResult(
      "Tuple index " + idx + " out of bounds",
      "Tuple type '" + objType + "' has no element at index " + idx + ".",
      "Use an index between 0 and " +
        (parseTupleTypeString(objType)!.length - 1) +
        ".",
      loc.line,
      loc.column,
    );
  return { isOk: true, value: elemType };
}

function checkStrMemberAccess(
  field: string,
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> {
  if (field === "length") return { isOk: true, value: "USize" };
  return checkStrFieldErr(field, loc);
}

function checkNonTupleIndex(
  objType: string,
  field: string,
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> | null {
  if (/^\d+$/.test(field) && !isTupleType(objType))
    return errResult(
      "Cannot index type '" + objType + "' with ." + field,
      "Only tuple types support numeric member access.",
      "Use a named field or ensure the type is a tuple.",
      loc.line,
      loc.column,
    );
  return null;
}

function findFieldForTypeParam(
  def: StructDef,
  typeParam: string,
): StructField | undefined {
  let fieldDef = def.fields.find((f) => f.typeName === typeParam);
  if (!fieldDef) {
    fieldDef = def.fields.find((f) => {
      const { args } = parseGenericTypeName(f.typeName);
      return args.includes(typeParam);
    });
  }
  return fieldDef;
}

function inferTypeFromNestedInstance(
  fieldDef: StructField,
  fieldValue: { value: Expression },
  typeParam: string,
): string | undefined {
  const { args: fieldTypeArgs } = parseGenericTypeName(fieldDef.typeName);
  if (fieldTypeArgs.length === 0 || fieldValue.value.type !== "StructInstance")
    return undefined;
  const nestedInstance = fieldValue.value as { typeArgs: string[] };
  if (nestedInstance.typeArgs.length === 0) return undefined;
  const paramIdx = fieldTypeArgs.indexOf(typeParam);
  if (paramIdx >= 0 && nestedInstance.typeArgs[paramIdx])
    return nestedInstance.typeArgs[paramIdx];
  return undefined;
}

export {
  typeMismatch,
  checkBoolOperand,
  checkLiteralExpr,
  checkStructFieldRef,
  checkStrFieldErr,
  checkPrimMemberErr,
  checkTupleMemberExpr,
  checkStrMemberAccess,
  checkNonTupleIndex,
  findFieldForTypeParam,
  inferTypeFromNestedInstance,
};
