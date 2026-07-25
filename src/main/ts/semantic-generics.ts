import type {
  Result,
  CompileError,
  Expression,
  StructField,
  VarEntry,
  StructDef,
  TypeAliasDef,
  TypeCheckCtx,
} from "./types";
import { checkLogicalExpr as clExpr } from "./semantic-checkers";
import { checkNotExpr as cnExpr } from "./semantic-checkers";
import { VALID_TYPES } from "./types";
import {
  checkStructUndefined,
  checkStructFieldCount,
  checkStructUnknownField,
  checkStructFieldType,
  checkTypeArgCount,
} from "./semantic-errors";

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

export function resolveFieldTypeWithGenerics(
  expr: Expression,
  field: string,
  structs: StructDef[],
  scope: VarEntry[],
  aliases: TypeAliasDef[],
): string | undefined {
  if (expr.type === "Identifier") {
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
  if (expr.type === "MemberExpression")
    return resolveMemberFieldType(expr, field, structs, scope, aliases);
  return undefined;
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
  if (expr.type === "LogicalExpression")
    return clExpr(expr, checkExpr.bind(null), scope, structs, aliases, loc);
  if (expr.type === "NotExpression")
    return cnExpr(expr, checkExpr.bind(null), scope, structs, aliases, loc);
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
  const countCheck = checkTypeArgCount(
    sexpr.structName,
    sexpr.typeArgs,
    def,
    loc,
  );
  if (!countCheck.isOk) return countCheck;
  const resolved = resolveAndValidateStruct(
    sexpr,
    def,
    scope,
    structs,
    aliases,
    loc,
  );
  if (!resolved.isOk) return resolved;
  const returnType =
    sexpr.typeArgs.length > 0
      ? sexpr.structName + "<" + sexpr.typeArgs.join(", ") + ">"
      : sexpr.structName;
  return { isOk: true, value: returnType };
}
function resolveAndValidateStruct(
  sexpr: {
    structName: string;
    typeArgs: string[];
    fields: { name: string; value: Expression }[];
  },
  def: StructDef,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
  loc: { line: number; column: number },
): Result<void, CompileError> {
  const typeArgsResult = resolveTypeArgs(
    sexpr,
    def,
    scope,
    structs,
    aliases,
    loc,
  );
  if (!typeArgsResult.isOk) return typeArgsResult;
  const argsCheck = validateTypeArgs(typeArgsResult.value, structs, loc);
  if (!argsCheck.isOk) return argsCheck;
  const resolvedFields = def.fields.map((f) => {
    const idx = def.typeParams.indexOf(f.typeName);
    return idx >= 0
      ? { name: f.name, typeName: typeArgsResult.value[idx]! }
      : f;
  });
  const fieldCheck = validateStructFields(
    sexpr.fields,
    resolvedFields,
    sexpr.structName,
    scope,
    structs,
    aliases,
    loc,
  );
  return fieldCheck;
}

function resolveTypeArgs(
  sexpr: { typeArgs: string[]; fields: { name: string; value: Expression }[] },
  def: StructDef,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
  loc: { line: number; column: number },
): Result<string[], CompileError> {
  if (sexpr.typeArgs.length > 0) return { isOk: true, value: sexpr.typeArgs };
  if (def.typeParams.length === 0) return { isOk: true, value: [] };
  const inferredResult = inferTypeArgs(def, sexpr.fields, {
    scope,
    structs,
    aliases,
    loc,
  });
  if (!inferredResult.isOk) return inferredResult;
  return { isOk: true, value: inferredResult.value };
}

function validateStructFields(
  fields: { name: string; value: Expression }[],
  resolvedFields: StructField[],
  structName: string,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
  loc: { line: number; column: number },
): Result<void, CompileError> {
  if (fields.length !== resolvedFields.length) {
    const countResult = checkStructFieldCount(
      structName,
      resolvedFields.length,
      fields.length,
      loc,
    );
    if (!countResult.isOk) return { isOk: false, error: countResult.error };
  }
  for (const field of fields) {
    const fieldResult = validateStructField(
      field,
      resolvedFields,
      structName,
      scope,
      structs,
      aliases,
      loc,
    );
    if (!fieldResult.isOk) return { isOk: false, error: fieldResult.error };
  }
  return { isOk: true, value: undefined };
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
    if (structDef) {
      const fieldDef = structDef.fields.find((f) => f.name === mexpr.field);
      if (!fieldDef)
        return {
          isOk: false,
          error: {
            message:
              "Unknown field '" +
              mexpr.field +
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

function validateStructField(
  field: { name: string; value: Expression },
  resolvedFields: StructField[],
  structName: string,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> {
  const defField = resolvedFields.find((f) => f.name === field.name);
  if (!defField) return checkStructUnknownField(field.name, structName, loc);
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
  if (!fieldType) return { isOk: true, value: undefined };
  const expectedResolved = resolveAlias(defField.typeName, aliases);
  const expectedBase = parseGenericTypeName(expectedResolved).base;
  const actualBase = parseGenericTypeName(fieldType).base;
  if (actualBase !== expectedBase)
    return checkStructFieldType(field.name, defField.typeName, fieldType, loc);
  return { isOk: true, value: undefined };
}
