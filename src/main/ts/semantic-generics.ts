import type {
  Result,
  CompileError,
  Expression,
  VarEntry,
  StructDef,
  TypeAliasDef,
  LogicalExpressionExpr,
  NotExpressionExpr,
} from "./types";
import { checkIsExpr, checkStructExpr } from "./semantic-struct";

const VALID_TYPES = ["U8", "U16", "U32", "I32", "F32"];

export { VALID_TYPES };

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

export function resolveAlias(
  typeName: string,
  aliases: TypeAliasDef[],
): string {
  const { base, args } = parseGenericTypeName(typeName);
  const aliasDef = aliases.find((a) => a.name === base);
  if (!aliasDef) return typeName;
  const resolved = resolveAlias(aliasDef.underlyingType, aliases);
  if (aliasDef.typeParams.length > 0 && args.length > 0) {
    let result = resolved;
    for (let i = 0; i < aliasDef.typeParams.length; i++) {
      const param = aliasDef.typeParams[i];
      const replacement = args[i] || param;
      result = result.replace(
        new RegExp("\\b" + param + "\\b", "g"),
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
