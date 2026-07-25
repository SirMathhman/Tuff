import type {
  Result,
  CompileError,
  Expression,
  StructField,
  VarEntry,
  StructDef,
  TypeAliasDef,
  LogicalExpressionExpr,
  NotExpressionExpr,
} from "./types";
import {
  checkStructUndefined,
  checkStructUnknownField,
  checkStructFieldType,
  checkTypeArgCount,
  checkStructFieldCount,
} from "./semantic-errors";
import {
  resolveAlias,
  parseGenericTypeName,
  checkTypeName,
  checkRef,
} from "./semantic-generics";

type StructCtx = {
  scope: VarEntry[];
  structs: StructDef[];
  aliases: TypeAliasDef[];
  loc: { line: number; column: number };
};
type Sexpr = {
  structName: string;
  typeArgs: string[];
  fields: { name: string; value: Expression }[];
};

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

function checkBoolBinOp(
  lexpr: LogicalExpressionExpr,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> {
  const leftResult = checkExpr(lexpr.left, scope, structs, aliases, loc);
  if (!leftResult.isOk) return leftResult;
  const boolErr = checkBoolOperand(leftResult.value, loc);
  if (boolErr && !boolErr.isOk) return boolErr;
  const rightResult = checkExpr(lexpr.right, scope, structs, aliases, loc);
  if (!rightResult.isOk) return rightResult;
  const boolErr2 = checkBoolOperand(rightResult.value, loc);
  if (boolErr2 && !boolErr2.isOk) return boolErr2;
  return { isOk: true, value: "Bool" };
}

function checkLiteralExpr(
  expr: Expression,
): Result<string | undefined, CompileError> | null {
  if (expr.type === "NumberLiteral")
    return { isOk: true, value: (expr as { typeName?: string }).typeName };
  if (expr.type === "BooleanLiteral") return { isOk: true, value: "Bool" };
  return null;
}

function checkNotExpr(
  expr: NotExpressionExpr,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> {
  const operandResult = checkExpr(expr.operand, scope, structs, aliases, loc);
  if (!operandResult.isOk) return operandResult;
  const notErr = checkBoolOperand(operandResult.value, loc);
  if (notErr && !notErr.isOk) return notErr;
  return { isOk: true, value: "Bool" };
}

export function checkExpr(
  expr: Expression,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> {
  const literalResult = checkLiteralExpr(expr);
  if (literalResult) return literalResult;
  if (expr.type === "IsExpression")
    return checkIsExpr(expr, scope, structs, aliases, loc);
  if (expr.type === "StructInstance")
    return checkStructExpr(expr, scope, structs, aliases, loc);
  if (expr.type === "MemberExpression")
    return checkMemberExpr(expr, scope, structs, aliases, loc);
  if (expr.type === "LogicalExpression")
    return checkBoolBinOp(
      expr as LogicalExpressionExpr,
      scope,
      structs,
      aliases,
      loc,
    );
  if (expr.type === "NotExpression")
    return checkNotExpr(
      expr as NotExpressionExpr,
      scope,
      structs,
      aliases,
      loc,
    );
  const idExpr = expr as { name: string };
  const refResult = checkRef(idExpr.name, scope, loc);
  if (!refResult.isOk) return refResult;
  return { isOk: true, value: refResult.value.typeName };
}

function checkMemberExpr(
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

function inferTypeArgs(
  def: StructDef,
  fields: { name: string; value: Expression }[],
  ctx: StructCtx,
): Result<string[], CompileError> {
  const inferred: string[] = [];
  for (const typeParam of def.typeParams) {
    const fieldDef = findFieldForTypeParam(def, typeParam);
    if (!fieldDef || !fields.find((f) => f.name === fieldDef?.name)) {
      inferred.push(typeParam);
      continue;
    }
    const fieldValue = fields.find((f) => f.name === fieldDef!.name)!;
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

function validateTypeArgs(
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
  ctx: StructCtx,
): Result<string | undefined, CompileError> {
  const defField = resolvedFields.find((f) => f.name === field.name);
  if (!defField)
    return checkStructUnknownField(field.name, structName, ctx.loc);
  if (!defField.typeName)
    return {
      isOk: false,
      error: {
        message: "Struct field '" + defField.name + "' missing type",
        reason: "All struct fields must have a type.",
        suggestedFix: "Add ': <Type>' to field.",
        line: ctx.loc.line,
        column: ctx.loc.column,
      },
    };
  const typeResult = checkExpr(
    field.value,
    ctx.scope,
    ctx.structs,
    ctx.aliases,
    ctx.loc,
  );
  if (!typeResult.isOk) return typeResult;
  const fieldType = typeResult.value;
  if (!fieldType) return { isOk: true, value: undefined };
  const expectedResolved = resolveAlias(defField.typeName, ctx.aliases);
  const expectedBase = parseGenericTypeName(expectedResolved).base;
  const actualBase = parseGenericTypeName(fieldType).base;
  if (actualBase !== expectedBase)
    return checkStructFieldType(
      field.name,
      defField.typeName,
      fieldType,
      ctx.loc,
    );
  return { isOk: true, value: undefined };
}

function validateStructFields(
  fields: { name: string; value: Expression }[],
  resolvedFields: StructField[],
  structName: string,
  ctx: StructCtx,
): Result<void, CompileError> {
  if (fields.length !== resolvedFields.length) {
    const countResult = checkStructFieldCount(
      structName,
      resolvedFields.length,
      fields.length,
      ctx.loc,
    );
    if (!countResult.isOk) return { isOk: false, error: countResult.error };
  }
  for (const field of fields) {
    const fieldResult = validateStructField(
      field,
      resolvedFields,
      structName,
      ctx,
    );
    if (!fieldResult.isOk) return { isOk: false, error: fieldResult.error };
  }
  return { isOk: true, value: undefined };
}

function resolveAndValidateStruct(
  sexpr: Sexpr,
  def: StructDef,
  ctx: StructCtx,
): Result<void, CompileError> {
  let resolvedArgs: string[];
  if (sexpr.typeArgs.length > 0) {
    resolvedArgs = sexpr.typeArgs;
  } else {
    const inferredResult = inferTypeArgs(def, sexpr.fields, ctx);
    if (!inferredResult.isOk) return inferredResult;
    resolvedArgs = inferredResult.value;
  }
  const argsCheck = validateTypeArgs(resolvedArgs, ctx.structs, ctx.loc);
  if (!argsCheck.isOk) return argsCheck;
  const resolvedFields = def.fields.map((f) => {
    const idx = def.typeParams.indexOf(f.typeName);
    return idx >= 0 ? { name: f.name, typeName: resolvedArgs[idx]! } : f;
  });
  return validateStructFields(
    sexpr.fields,
    resolvedFields,
    sexpr.structName,
    ctx,
  );
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
  const sexpr = expr as Sexpr;
  const def = structs.find((s) => s.name === sexpr.structName);
  if (!def) return checkStructUndefined(sexpr.structName, loc);
  const countCheck = checkTypeArgCount(
    sexpr.structName,
    sexpr.typeArgs,
    def,
    loc,
  );
  if (!countCheck.isOk) return countCheck;
  const resolved = resolveAndValidateStruct(sexpr, def, {
    scope,
    structs,
    aliases,
    loc,
  });
  if (!resolved.isOk) return resolved;
  const returnType =
    sexpr.typeArgs.length > 0
      ? sexpr.structName + "<" + sexpr.typeArgs.join(", ") + ">"
      : sexpr.structName;
  return { isOk: true, value: returnType };
}
