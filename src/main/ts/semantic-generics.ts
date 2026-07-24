import type { Result, CompileError, Expression, StructField } from "./types";
import {
  checkStructUndefined,
  checkStructFieldCount,
  checkStructUnknownField,
  checkStructFieldType,
} from "./semantic-errors";

export interface VarEntry {
  name: string;
  mutable: boolean;
  typeName: string | undefined;
}

export interface StructDef {
  name: string;
  typeParams: string[];
  fields: StructField[];
  resolvedFields?: StructField[];
}

export interface TypeAliasDef {
  name: string;
  typeParams: string[];
  underlyingType: string;
}

export interface TypeCheckCtx {
  scope: VarEntry[];
  structs: StructDef[];
  aliases: TypeAliasDef[];
  loc: { line: number; column: number };
}

export function resolveAlias(
  typeName: string,
  aliases: TypeAliasDef[],
): string {
  const { base, args } = parseGenericTypeName(typeName);
  const aliasDef = aliases.find((a) => a.name === base);
  if (!aliasDef) return typeName;
  const resolved = resolveAlias(aliasDef.underlyingType, aliases);
  const { base: resolvedBase } = parseGenericTypeName(resolved);
  if (aliasDef.typeParams.length > 0 && args.length > 0) {
    let result = resolvedBase;
    for (let i = 0; i < aliasDef.typeParams.length; i++) {
      const param = aliasDef.typeParams[i];
      const replacement = args[i] || param;
      result = result.replace(
        new RegExp("\\b" + param + "\\b"),
        String(replacement),
      );
    }
    return result;
  }
  return resolved;
}

export function checkCircularAlias(
  aliasName: string,
  underlyingType: string,
  aliases: TypeAliasDef[],
  visited: string[],
): boolean {
  if (visited.includes(underlyingType)) return true;
  const aliasDef = aliases.find((a) => a.name === underlyingType);
  if (aliasDef) {
    if (aliasDef.name === aliasName) return true;
    return checkCircularAlias(
      aliasName,
      aliasDef.underlyingType,
      aliases,
      visited.concat([aliasDef.name]),
    );
  }
  return false;
}

const VALID_TYPES = [
  "U8",
  "U16",
  "U32",
  "U64",
  "I8",
  "I16",
  "I32",
  "I64",
  "Bool",
];

export function checkTypeRef(
  typeName: string,
  structs: StructDef[],
  loc: { line: number; column: number },
  errorMsgPrefix: string,
): Result<StructDef | undefined, CompileError> {
  const isNumeric = VALID_TYPES.includes(typeName);
  const structDef = structs.find((s) => s.name === typeName);
  if (!isNumeric && !structDef)
    return {
      isOk: false,
      error: {
        message: errorMsgPrefix + typeName + "'",
        reason: "Type must be a valid numeric type, Bool, or defined struct.",
        suggestedFix:
          "Use a valid type like U8, U32, Bool, or define the struct first.",
        line: loc.line,
        column: loc.column,
      },
    };
  return { isOk: true, value: structDef };
}

export function parseGenericTypeName(typeName: string): {
  base: string;
  args: string[];
} {
  const idx = typeName.indexOf("<");
  if (idx < 0) return { base: typeName, args: [] };
  const base = typeName.substring(0, idx);
  const argsStr = typeName.substring(idx + 1, typeName.lastIndexOf(">"));
  const args = argsStr.split(",").map((s) => s.trim());
  return { base, args };
}

export function findFieldForTypeParam(
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

export function inferTypeFromNestedInstance(
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

function resolveIdentifierFieldType(
  expr: Expression,
  field: string,
  structs: StructDef[],
  scope: VarEntry[],
  aliases: TypeAliasDef[],
): string | undefined {
  const idExpr = expr as { name: string };
  const entry = scope.find((e) => e.name === idExpr.name);
  if (!entry || !entry.typeName) return undefined;
  const resolved = resolveAlias(entry.typeName, aliases);
  const { base, args } = parseGenericTypeName(resolved);
  const structDef = structs.find((s) => s.name === base);
  if (!structDef) return undefined;
  const f = structDef.fields.find((f) => f.name === field);
  if (!f) return undefined;
  const paramIdx = structDef.typeParams.indexOf(f.typeName);
  if (paramIdx >= 0 && args.length > paramIdx) return args[paramIdx];
  return f.typeName;
}

function resolveMemberFieldType(
  expr: Expression,
  field: string,
  structs: StructDef[],
  scope: VarEntry[],
  aliases: TypeAliasDef[],
): string | undefined {
  const mexpr = expr as { object: Expression; field: string };
  const objType = resolveFieldTypeWithGenerics(
    mexpr.object,
    mexpr.field,
    structs,
    scope,
    aliases,
  );
  if (!objType) return undefined;
  const structDef = structs.find((s) => s.name === objType);
  if (!structDef) return undefined;
  const f = structDef.fields.find((f) => f.name === field);
  return f?.typeName;
}

export function resolveFieldTypeWithGenerics(
  expr: Expression,
  field: string,
  structs: StructDef[],
  scope: VarEntry[],
  aliases: TypeAliasDef[],
): string | undefined {
  if (expr.type === "Identifier")
    return resolveIdentifierFieldType(expr, field, structs, scope, aliases);
  if (expr.type === "MemberExpression")
    return resolveMemberFieldType(expr, field, structs, scope, aliases);
  return undefined;
}

export function checkTypeName(
  typeName: string,
  structs: StructDef[],
  loc: { line: number; column: number },
  label: string,
  aliases?: TypeAliasDef[],
): Result<void, CompileError> {
  const resolved = aliases ? resolveAlias(typeName, aliases) : typeName;
  const { base } = parseGenericTypeName(resolved);
  const isNumeric = VALID_TYPES.includes(base);
  const isStruct = structs.some((s) => s.name === base);
  const isAlias = aliases ? aliases.some((a) => a.name === typeName) : false;
  if (!isNumeric && !isStruct && !isAlias)
    return {
      isOk: false,
      error: {
        message: label + "'" + typeName + "'",
        reason:
          "Supported types: " + VALID_TYPES.join(", ") + " or a defined struct",
        suggestedFix:
          "Use a valid type like U8, U32, Bool, or define the struct first.",
        line: loc.line,
        column: loc.column,
      },
    };
  return { isOk: true, value: undefined };
}

export function checkRef(
  name: string,
  scope: VarEntry[],
  loc: { line: number; column: number },
): Result<{ typeName: string | undefined }, CompileError> {
  const entry = scope.find((e) => e.name === name);
  if (!entry)
    return {
      isOk: false,
      error: {
        message: "Use of undeclared variable '" + name + "'",
        reason: "Variable must be declared before use.",
        suggestedFix: "Declare the variable with 'let' first.",
        line: loc.line,
        column: loc.column,
      },
    };
  return { isOk: true, value: { typeName: entry.typeName } };
}

export function checkExpr(
  expr: Expression,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> {
  if (expr.type === "NumberLiteral")
    return { isOk: true, value: (expr as { typeName?: string }).typeName };
  if (expr.type === "BooleanLiteral") return { isOk: true, value: "Bool" };
  if (expr.type === "IsExpression")
    return checkIsExpr(expr, scope, structs, aliases, loc);
  if (expr.type === "StructInstance")
    return checkStructExpr(expr, scope, structs, aliases, loc);
  if (expr.type === "MemberExpression")
    return checkMemberExpr(expr, scope, structs, aliases, loc);
  const refResult = checkRef(expr.name, scope, loc);
  if (!refResult.isOk) return refResult;
  return { isOk: true, value: refResult.value.typeName };
}

export function checkIsExpr(
  expr: Expression,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> {
  const isexpr = expr as { operand: Expression; typeName: string };
  const operandResult = checkExpr(isexpr.operand, scope, structs, aliases, loc);
  if (!operandResult.isOk) return operandResult;
  const typeCheck = checkTypeName(
    isexpr.typeName,
    structs,
    loc,
    "Invalid type '",
    aliases,
  );
  if (!typeCheck.isOk) return typeCheck;
  return { isOk: true, value: "Bool" };
}

export function checkStructExpr(
  expr: Expression,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> {
  const sexpr = expr as {
    structName: string;
    typeArgs: string[];
    fields: { name: string; value: Expression }[];
  };
  const def = structs.find((s) => s.name === sexpr.structName);
  if (!def) return checkStructUndefined(sexpr.structName, loc);
  const countCheck = validateTypeArgCount(
    sexpr.structName,
    sexpr.typeArgs,
    def,
    loc,
  );
  if (!countCheck.isOk) return countCheck;
  let resolvedTypeArgs = sexpr.typeArgs;
  if (sexpr.typeArgs.length === 0 && def.typeParams.length > 0) {
    const inferredResult = inferTypeArgs(def, sexpr.fields, {
      scope,
      structs,
      aliases,
      loc,
    });
    if (!inferredResult.isOk) return inferredResult;
    resolvedTypeArgs = inferredResult.value;
  }
  const argsCheck = validateTypeArgs(resolvedTypeArgs, structs, loc);
  if (!argsCheck.isOk) return argsCheck;
  const resolvedFields = resolveStructFields(def, resolvedTypeArgs);
  if (sexpr.fields.length !== resolvedFields.length)
    return checkStructFieldCount(
      sexpr.structName,
      resolvedFields.length,
      sexpr.fields.length,
      loc,
    );
  for (const field of sexpr.fields) {
    const defField = resolvedFields.find((f) => f.name === field.name);
    if (!defField)
      return checkStructUnknownField(field.name, sexpr.structName, loc);
    if (!defField.typeName)
      return {
        isOk: false,
        error: {
          message: "Struct field '" + defField.name + "' missing type",
          reason: "All struct fields must have a type.",
          suggestedFix: "Add ': <Type>' to field.",
          line: loc.line,
          column: loc.column,
        },
      };
    const typeResult = checkExpr(field.value, scope, structs, aliases, loc);
    if (!typeResult.isOk) return typeResult;
    const fieldType = typeResult.value;
    const expectedResolved = resolveAlias(defField.typeName, aliases);
    const expectedBase = parseGenericTypeName(expectedResolved).base;
    const actualBase = fieldType
      ? parseGenericTypeName(fieldType).base
      : undefined;
    if (fieldType && actualBase !== expectedBase)
      return checkStructFieldType(
        field.name,
        defField.typeName,
        fieldType,
        loc,
      );
  }
  const returnType =
    sexpr.typeArgs.length > 0
      ? sexpr.structName + "<" + sexpr.typeArgs.join(", ") + ">"
      : sexpr.structName;
  return { isOk: true, value: returnType };
}

export function checkMemberExpr(
  expr: Expression,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> {
  const mexpr = expr as { object: Expression; field: string };
  const objResult = checkExpr(mexpr.object, scope, structs, aliases, loc);
  if (!objResult.isOk) return objResult;
  const objType = objResult.value;
  if (objType) {
    const structDef = structs.find((s) => s.name === objType);
    if (structDef) return checkStructField(structDef, mexpr.field, loc);
  }
  return { isOk: true, value: objType };
}

export function inferTypeArgs(
  def: StructDef,
  fields: { name: string; value: Expression }[],
  ctx: TypeCheckCtx,
): Result<string[], CompileError> {
  const inferred: string[] = [];
  for (const typeParam of def.typeParams) {
    const fieldDef = findFieldForTypeParam(def, typeParam);
    if (!fieldDef) {
      inferred.push(typeParam);
      continue;
    }
    const fieldValue = fields.find((f) => f.name === fieldDef.name);
    if (!fieldValue) {
      inferred.push(typeParam);
      continue;
    }
    const nestedType = inferTypeFromNestedInstance(
      fieldDef,
      fieldValue,
      typeParam,
    );
    if (nestedType) {
      inferred.push(nestedType);
      continue;
    }
    const typeResult = checkExpr(
      fieldValue.value,
      ctx.scope,
      ctx.structs,
      ctx.aliases,
      ctx.loc,
    );
    if (!typeResult.isOk) return typeResult;
    inferred.push(typeResult.value || typeParam);
  }
  return { isOk: true, value: inferred };
}

export function validateTypeArgCount(
  structName: string,
  typeArgs: string[],
  def: StructDef,
  loc: { line: number; column: number },
): Result<void, CompileError> {
  if (typeArgs.length > 0 && typeArgs.length !== def.typeParams.length)
    return {
      isOk: false,
      error: {
        message:
          "Struct '" +
          structName +
          "' expects " +
          def.typeParams.length +
          " type param(s) but got " +
          typeArgs.length,
        reason: "Type argument count must match type parameter count.",
        suggestedFix: "Provide " + def.typeParams.length + " type arguments.",
        line: loc.line,
        column: loc.column,
      },
    };
  return { isOk: true, value: undefined };
}

export function validateTypeArgs(
  typeArgs: string[],
  structs: StructDef[],
  loc: { line: number; column: number },
): Result<void, CompileError> {
  for (const arg of typeArgs) {
    const argCheck = checkTypeName(
      arg,
      structs,
      loc,
      "Invalid type argument '",
    );
    if (!argCheck.isOk) return argCheck;
  }
  return { isOk: true, value: undefined };
}

function checkStructField(
  structDef: StructDef,
  fieldName: string,
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> {
  const fieldDef = structDef.fields.find((f) => f.name === fieldName);
  if (!fieldDef)
    return {
      isOk: false,
      error: {
        message:
          "Unknown field '" +
          fieldName +
          "' on struct '" +
          structDef.name +
          "'",
        reason: "Field does not exist on struct.",
        suggestedFix: "Use a valid field name.",
        line: loc.line,
        column: loc.column,
      },
    };
  return { isOk: true, value: fieldDef.typeName };
}

export function resolveStructFields(
  def: StructDef,
  resolvedTypeArgs: string[],
): StructField[] {
  return def.fields.map((f) => {
    const paramIdx = def.typeParams.indexOf(f.typeName);
    if (paramIdx >= 0)
      return { name: f.name, typeName: resolvedTypeArgs[paramIdx]! };
    return f;
  });
}
