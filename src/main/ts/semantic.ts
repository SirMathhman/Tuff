import type {
  Result,
  CompileError,
  Expression,
  Statement,
  LetDeclarationNode,
  AssignmentNode,
  IdentifierNode,
  StructDefinitionNode,
  MemberAssignmentNode,
  TypeAliasNode,
} from "./types";
import {
  checkAssignmentUndeclared,
  checkAssignmentImmutable,
  checkMemberUndeclared,
  checkMemberImmutable,
  checkTypeMatch,
} from "./semantic-errors";
import {
  parseGenericTypeName,
  checkTypeName,
  checkExpr,
  checkRef,
  resolveFieldTypeWithGenerics,
  checkCircularAlias,
  resolveAlias,
  checkTypeRef,
} from "./semantic-generics";
import type { StructDef, VarEntry, TypeAliasDef } from "./semantic-generics";

function checkStructDef(
  node: StructDefinitionNode,
  structs: StructDef[],
  aliases: TypeAliasDef[],
): Result<void, CompileError> {
  for (const field of node.fields) {
    if (!field.typeName)
      return {
        isOk: false,
        error: {
          message: "Struct field '" + field.name + "' missing type annotation",
          reason: "All struct fields must have a type.",
          suggestedFix: "Add ': <Type>' to field '" + field.name + "'.",
          line: node.line,
          column: node.column,
        },
      };
    const isTypeParam = node.typeParams.includes(field.typeName);
    if (!isTypeParam) {
      const resolved = resolveAlias(field.typeName, aliases);
      const { base: fieldBase, args: fieldArgs } =
        parseGenericTypeName(resolved);
      const fieldCheck = checkTypeName(
        fieldBase,
        structs,
        node,
        "Invalid field type ",
      );
      if (!fieldCheck.isOk) return fieldCheck;
      for (const arg of fieldArgs) {
        const isArgTypeParam = node.typeParams.includes(arg);
        if (!isArgTypeParam) {
          const argCheck = checkTypeName(
            arg,
            structs,
            node,
            "Invalid field type argument '",
          );
          if (!argCheck.isOk) return argCheck;
        }
      }
    }
  }
  structs.push({
    name: node.name,
    typeParams: node.typeParams,
    fields: node.fields,
  });
  return { isOk: true, value: undefined };
}

function aliasError(
  msg: string,
  reason: string,
  fix: string,
  node: TypeAliasNode,
): Result<void, CompileError> {
  return {
    isOk: false,
    error: {
      message: msg,
      reason,
      suggestedFix: fix,
      line: node.line,
      column: node.column,
    },
  };
}
function checkAliasUnderlying(
  underlyingType: string,
  typeParams: string[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
  node: TypeAliasNode,
): Result<void, CompileError> {
  const resolved = resolveAlias(underlyingType, aliases);
  const { base, args } = parseGenericTypeName(resolved);
  const baseCheck = checkTypeRef(
    base,
    structs,
    node,
    "Invalid underlying type '",
  );
  if (!baseCheck.isOk) return baseCheck;
  const structDef = baseCheck.value;
  if (
    structDef &&
    args.length > 0 &&
    args.length !== structDef.typeParams.length
  )
    return aliasError(
      "Struct '" +
        base +
        "' expects " +
        structDef.typeParams.length +
        " type param(s) but got " +
        args.length,
      "Type argument count must match type parameter count.",
      "Provide " + structDef.typeParams.length + " type arguments.",
      node,
    );
  for (const arg of args) {
    if (typeParams.includes(arg)) continue;
    const argCheck = checkTypeName(
      arg,
      structs,
      node,
      "Invalid type argument '",
      aliases,
    );
    if (!argCheck.isOk) return argCheck;
  }
  return { isOk: true, value: undefined };
}
function checkTypeAlias(
  node: TypeAliasNode,
  structs: StructDef[],
  aliases: TypeAliasDef[],
): Result<void, CompileError> {
  if (checkCircularAlias(node.name, node.underlyingType, aliases, []))
    return aliasError(
      "Circular type alias reference detected for '" + node.name + "'",
      "Type aliases cannot reference themselves directly or indirectly.",
      "Remove the circular reference.",
      node,
    );
  const underlyingCheck = checkAliasUnderlying(
    node.underlyingType,
    node.typeParams,
    structs,
    aliases,
    node,
  );
  if (!underlyingCheck.isOk) return underlyingCheck;
  aliases.push({
    name: node.name,
    typeParams: node.typeParams,
    underlyingType: node.underlyingType,
  });
  return { isOk: true, value: undefined };
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
    return {
      isOk: false,
      error: {
        message:
          "Generic struct '" + base + "' requires explicit type annotation",
        reason:
          "Generic structs need type arguments to resolve type parameters.",
        suggestedFix:
          "Add type annotation like '" +
          base +
          "<Type>' to variable declaration.",
        line: node.line,
        column: node.column,
      },
    };
  return { isOk: true, value: undefined };
}
function checkLetSemantics(
  node: LetDeclarationNode,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
): Result<void, CompileError> {
  const typeCheck = checkLetType(node, structs, aliases);
  if (!typeCheck.isOk) return typeCheck;
  const genericCheck = checkGenericStructInstantiation(node, structs, aliases);
  if (!genericCheck.isOk) return genericCheck;
  const exprTypeResult = checkExpr(node.value, scope, structs, aliases, node);
  if (!exprTypeResult.isOk) return exprTypeResult;
  const exprType = exprTypeResult.value;
  const resolvedTypeName =
    node.typeName ||
    (exprType && structs.some((s) => s.name === exprType)
      ? exprType
      : undefined);
  node.typeName = resolvedTypeName;
  const exprCheck = checkLetExprType(node, scope, structs, aliases);
  if (!exprCheck.isOk) return exprCheck;
  scope.push({
    name: node.name,
    mutable: node.mutable,
    typeName: resolvedTypeName,
  });
  return { isOk: true, value: undefined };
}

function checkLetType(
  node: LetDeclarationNode,
  structs: StructDef[],
  aliases: TypeAliasDef[],
): Result<void, CompileError> {
  if (!node.typeName) return { isOk: true, value: undefined };
  const resolved = resolveAlias(node.typeName, aliases);
  const { base, args } = parseGenericTypeName(resolved);
  const baseCheck = checkTypeRef(base, structs, node, "Invalid type '");
  if (!baseCheck.isOk) return baseCheck;
  const structDef = baseCheck.value;
  if (
    structDef &&
    args.length > 0 &&
    args.length !== structDef.typeParams.length
  )
    return {
      isOk: false,
      error: {
        message:
          "Struct '" +
          base +
          "' expects " +
          structDef.typeParams.length +
          " type param(s) but got " +
          args.length,
        reason: "Type argument count must match type parameter count.",
        suggestedFix:
          "Provide " + structDef.typeParams.length + " type arguments.",
        line: node.line,
        column: node.column,
      },
    };
  // Validate each type arg
  for (const arg of args) {
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

function checkLetExprType(
  node: LetDeclarationNode,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
): Result<void, CompileError> {
  const exprTypeResult = checkExpr(node.value, scope, structs, aliases, node);
  if (!exprTypeResult.isOk) return exprTypeResult;
  const exprType = exprTypeResult.value;
  // Allow struct type inference: let p = Point { ... } infers Point type
  if (!node.typeName && exprType && structs.some((s) => s.name === exprType))
    return { isOk: true, value: undefined };
  // For generic structs, compare base types (e.g. Point<I32> matches Point)
  if (node.typeName && exprType) {
    const resolved = resolveAlias(node.typeName, aliases);
    const { base } = parseGenericTypeName(resolved);
    if (base === exprType) return { isOk: true, value: undefined };
  }
  const resolvedDecl = node.typeName
    ? resolveAlias(node.typeName, aliases)
    : undefined;
  return checkTypeMatch(resolvedDecl, exprType, node);
}
function checkAssignmentSemantics(
  node: AssignmentNode,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
): Result<void, CompileError> {
  const entry = scope.find((e) => e.name === node.name);
  if (!entry) return checkAssignmentUndeclared(node);
  if (!entry.mutable) return checkAssignmentImmutable(node);
  const rhsResult = checkAssignmentRhsType(
    node,
    scope,
    entry,
    structs,
    aliases,
  );
  return rhsResult;
}
function checkAssignmentRhsType(
  node: AssignmentNode,
  scope: VarEntry[],
  entry: VarEntry,
  structs: StructDef[],
  aliases: TypeAliasDef[],
): Result<void, CompileError> {
  const rhsTypeResult = checkExpr(node.value, scope, structs, aliases, node);
  if (!rhsTypeResult.isOk) return rhsTypeResult;
  const rhsType = rhsTypeResult.value;
  if (!entry.typeName) return { isOk: true, value: undefined };
  const resolvedDecl = resolveAlias(entry.typeName, aliases);
  return checkTypeMatch(resolvedDecl, rhsType, node);
}
function getExprBaseName(expr: Expression): string {
  if (expr.type === "Identifier") return (expr as { name: string }).name;
  if (expr.type === "MemberExpression")
    return getExprBaseName((expr as { object: Expression }).object);
  return "_";
}

function checkMemberAssignment(
  node: MemberAssignmentNode,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
): Result<void, CompileError> {
  const baseName = getExprBaseName(node.object);
  const entry = scope.find((e) => e.name === baseName);
  if (!entry)
    return checkMemberUndeclared(
      { line: node.line, column: node.column },
      baseName,
    );
  if (!entry.mutable)
    return checkMemberImmutable(
      { line: node.line, column: node.column },
      baseName,
    );
  const fieldResult = resolveFieldTypeWithGenerics(
    node.object,
    node.field,
    structs,
    scope,
    aliases,
  );
  if (!fieldResult) return { isOk: true, value: undefined };
  const rhsTypeResult = checkExpr(node.value, scope, structs, aliases, node);
  if (!rhsTypeResult.isOk) return rhsTypeResult;
  return checkTypeMatch(fieldResult, rhsTypeResult.value, node);
}

export function analyzeSemantics(
  statements: Statement[],
): Result<Statement[], CompileError> {
  const scope: VarEntry[] = [];
  const structs: StructDef[] = [];
  const aliases: TypeAliasDef[] = [];
  for (const stmt of statements) {
    const result = analyzeStatement(stmt, scope, structs, aliases);
    if (!result.isOk) return result;
  }
  return { isOk: true, value: statements };
}

function analyzeStatement(
  stmt: Statement,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
): Result<void, CompileError> {
  if (stmt.type === "StructDefinition") {
    const node = stmt as StructDefinitionNode;
    return checkStructDef(node, structs, aliases);
  } else if (stmt.type === "TypeAlias") {
    const node = stmt as TypeAliasNode;
    return checkTypeAlias(node, structs, aliases);
  } else if (stmt.type === "LetDeclaration") {
    const node = stmt as LetDeclarationNode;
    return checkLetSemantics(node, scope, structs, aliases);
  } else if (stmt.type === "Assignment") {
    const node = stmt as AssignmentNode;
    return checkAssignmentSemantics(node, scope, structs, aliases);
  } else if (stmt.type === "MemberAssignment") {
    const node = stmt as MemberAssignmentNode;
    return checkMemberAssignment(node, scope, structs, aliases);
  } else if (stmt.type === "Identifier") {
    const node = stmt as IdentifierNode;
    return checkIdentifierStatement(node, scope, structs, aliases);
  }
  return { isOk: true, value: undefined };
}

function checkIdentifierStatement(
  node: IdentifierNode,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
): Result<void, CompileError> {
  if (node.name.includes(".")) {
    const parts = node.name.split(".");
    const baseName = parts[0];
    const entry = scope.find((e) => e.name === baseName);
    if (!entry)
      return {
        isOk: false,
        error: {
          message: "Use of undeclared variable '" + baseName + "'",
          reason: "Variable must be declared before use.",
          suggestedFix: "Declare the variable with 'let' first.",
          line: node.line,
          column: node.column,
        },
      };
    return validateFieldChain(parts, entry.typeName, structs, aliases);
  }
  const refResult = checkRef(node.name, scope, node);
  if (!refResult.isOk) return refResult;
  return { isOk: true, value: undefined };
}
function validateFieldChain(
  parts: string[],
  initialType: string | undefined,
  structs: StructDef[],
  aliases: TypeAliasDef[],
): Result<void, CompileError> {
  let currentType = initialType
    ? resolveAlias(initialType, aliases)
    : undefined;
  for (let i = 1; i < parts.length; i++) {
    if (!currentType) break;
    const structDef = structs.find((s) => s.name === currentType);
    if (!structDef) break;
    const fieldDef = structDef.fields.find((f) => f.name === parts[i]);
    if (!fieldDef) break;
    currentType = fieldDef.typeName;
  }
  return { isOk: true, value: undefined };
}
