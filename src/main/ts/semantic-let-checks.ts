import type {
  Result,
  CompileError,
  LetDeclarationNode,
  StructDef,
  VarEntry,
  TypeAliasDef,
  FunctionDef,
  ModuleExportsMap,
} from "./types";
import { VALID_TYPES } from "./types";
import {
  parseGenericTypeName,
  checkTypeName,
  resolveAlias,
} from "./semantic-generics";
import { checkExpr } from "./semantic-expr";
import { checkTypeMatch, errResult, checkTypeRef } from "./semantic-errors";

export function checkSingleTypeRef(
  typeName: string,
  structs: StructDef[],
  aliases: TypeAliasDef[],
  node: LetDeclarationNode,
  allowedTypeParams?: string[],
): Result<void, CompileError> {
  const resolved = resolveAlias(typeName, aliases);
  const parsed = parseGenericTypeName(resolved);
  if (allowedTypeParams && allowedTypeParams.includes(parsed.base)) {
    return { isOk: true, value: undefined };
  }
  const baseCheck = checkTypeRef(parsed.base, structs, node, "Invalid type '");
  if (!baseCheck.isOk) return baseCheck;
  const structDef = baseCheck.value;
  if (
    structDef &&
    parsed.args.length > 0 &&
    parsed.args.length !== structDef.typeParams.length
  ) {
    return errResult(
      "Struct '" +
        parsed.base +
        "' expects " +
        structDef.typeParams.length +
        " type param(s) but got " +
        parsed.args.length,
      "Type argument count must match type parameter count.",
      "Provide " + structDef.typeParams.length + " type arguments.",
      node.line,
      node.column,
    );
  }
  for (const arg of parsed.args) {
    const argCheck = checkTypeName(
      arg,
      structs,
      node,
      "Invalid type argument '",
    );
    if (!argCheck.isOk) return argCheck;
  }
  return { isOk: true, value: undefined };
}

function checkLetType(
  node: LetDeclarationNode,
  structs: StructDef[],
  aliases: TypeAliasDef[],
): Result<void, CompileError> {
  if (!node.typeName) return { isOk: true, value: undefined };
  const resolvedTypeName = resolveAlias(node.typeName, aliases);
  if (resolvedTypeName.includes(" | ")) {
    const arms = resolvedTypeName.split(" | ").map((a) => a.trim());
    for (const arm of arms) {
      const armResult = checkSingleTypeRef(arm, structs, aliases, node);
      if (!armResult.isOk) return armResult;
    }
    return { isOk: true, value: undefined };
  }
  return checkSingleTypeRef(resolvedTypeName, structs, aliases, node);
}

function checkGenericStructInstantiation(
  node: LetDeclarationNode,
  structs: StructDef[],
  aliases: TypeAliasDef[],
): Result<void, CompileError> {
  if (node.typeName || node.value.type !== "StructInstance")
    return { isOk: true, value: undefined };
  const sexpr = node.value as { structName: string; typeArgs: string[] };
  const resolvedName = resolveAlias(sexpr.structName, aliases);
  const { base } = parseGenericTypeName(resolvedName);
  const structDef = structs.find((s) => s.name === base);
  if (
    structDef &&
    structDef.typeParams.length > 0 &&
    sexpr.typeArgs.length === 0
  )
    return errResult(
      "Generic struct '" + base + "' requires explicit type annotation",
      "Generic structs need type arguments to resolve type parameters.",
      "Add type annotation like '" + base + "<Type>' to variable declaration.",
      node.line,
      node.column,
    );
  return { isOk: true, value: undefined };
}

function inferLetTypeName(
  node: LetDeclarationNode,
  exprType: string | undefined,
  structs: StructDef[],
): string | undefined {
  if (node.typeName) return node.typeName;
  if (exprType && structs.some((s) => s.name === exprType)) return exprType;
  return undefined;
}

function inferLetTypeValue(
  resolvedTypeName: string | undefined,
  exprType: string | undefined,
): string | undefined {
  if (resolvedTypeName) return resolvedTypeName;
  if (exprType && VALID_TYPES.includes(exprType)) return exprType;
  return undefined;
}

function checkLetExprEarlyReturns(
  node: LetDeclarationNode,
  exprType: string | undefined,
  structs: StructDef[],
  aliases: TypeAliasDef[],
): Result<void, CompileError> | null {
  if (!node.typeName && exprType && structs.some((s) => s.name === exprType))
    return { isOk: true, value: undefined };
  if (node.typeName && exprType) {
    const resolved = resolveAlias(node.typeName, aliases);
    const { base } = parseGenericTypeName(resolved);
    if (base === exprType) return { isOk: true, value: undefined };
  }
  return null;
}

function checkExprForLet(
  node: LetDeclarationNode,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
  moduleExports: ModuleExportsMap | undefined,
  functions: FunctionDef[] | undefined,
): Result<string | undefined, CompileError> {
  const exprTypeResult = checkExpr(node.value, {
    scope,
    structs,
    aliases,
    functions: functions || [],
    loc: node,
    moduleExports,
  });
  if (!exprTypeResult.isOk) return exprTypeResult;
  return { isOk: true, value: exprTypeResult.value };
}
export function checkLetExprType(
  node: LetDeclarationNode,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
  moduleExports?: ModuleExportsMap,
  functions?: FunctionDef[],
): Result<void, CompileError> {
  const exprTypeResult = checkExprForLet(
    node,
    scope,
    structs,
    aliases,
    moduleExports,
    functions,
  );
  if (!exprTypeResult.isOk) return exprTypeResult;
  const exprType = exprTypeResult.value;
  const early = checkLetExprEarlyReturns(node, exprType, structs, aliases);
  if (early) return early;
  const resolvedDecl = node.typeName
    ? resolveAlias(node.typeName, aliases)
    : undefined;
  if (
    !resolvedDecl &&
    node.value.type !== "NumberLiteral" &&
    node.value.type !== "StringLiteral"
  )
    return { isOk: true, value: undefined };
  return checkTypeMatch(resolvedDecl, exprType, node);
}

export function checkLetSemantics(
  node: LetDeclarationNode,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
  moduleExports?: ModuleExportsMap,
  functions?: FunctionDef[],
): Result<void, CompileError> {
  const typeCheck = checkLetType(node, structs, aliases);
  if (!typeCheck.isOk) return typeCheck;
  const genericCheck = checkGenericStructInstantiation(node, structs, aliases);
  if (!genericCheck.isOk) return genericCheck;
  const exprTypeResult = checkExprForLet(
    node,
    scope,
    structs,
    aliases,
    moduleExports,
    functions,
  );
  if (!exprTypeResult.isOk) return exprTypeResult;
  const exprType = exprTypeResult.value;
  const resolvedTypeName = inferLetTypeName(node, exprType, structs);
  node.typeName = resolvedTypeName;
  const inferredType = inferLetTypeValue(resolvedTypeName, exprType);
  const exprCheck = checkLetExprType(
    node,
    scope,
    structs,
    aliases,
    moduleExports,
    functions,
  );
  if (!exprCheck.isOk) return exprCheck;
  scope.push({
    name: node.name,
    mutable: node.mutable,
    typeName: inferredType,
  });
  return { isOk: true, value: undefined };
}
