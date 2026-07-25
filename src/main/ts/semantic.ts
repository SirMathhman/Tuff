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
  StructDef,
  VarEntry,
  TypeAliasDef,
} from "./types";
import { VALID_TYPES } from "./types";
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
} from "./semantic-generics";

function checkTypeRef(
  typeName: string,
  structs: StructDef[],
  loc: { line: number; column: number },
  errorMsgPrefix: string,
): Result<StructDef | undefined, CompileError> {
  const isNumeric = VALID_TYPES.includes(typeName);
  const structDef = structs.find((s) => s.name === typeName);
  if (!isNumeric && !structDef)
    return errResult(
      errorMsgPrefix + typeName + "'",
      "Type must be a valid numeric type, Bool, or defined struct.",
      "Use a valid type like U8, U32, Bool, or define the struct first.",
      loc.line,
      loc.column,
    );
  return { isOk: true, value: structDef };
}
function checkStructDef(
  node: StructDefinitionNode,
  structs: StructDef[],
  aliases: TypeAliasDef[],
): Result<void, CompileError> {
  for (const field of node.fields) {
    if (!field.typeName)
      return errResult(
        "Struct field '" + field.name + "' missing type annotation",
        "All struct fields must have a type.",
        "Add ': <Type>' to field '" + field.name + "'.",
        node.line,
        node.column,
      );
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

function errResult<T = never>(
  msg: string,
  reason: string,
  fix: string,
  line: number,
  column: number,
): Result<T, CompileError> {
  return {
    isOk: false,
    error: { message: msg, reason, suggestedFix: fix, line, column },
  } as Result<T, CompileError>;
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
    return errResult(
      "Struct '" +
        base +
        "' expects " +
        structDef.typeParams.length +
        " type param(s) but got " +
        args.length,
      "Type argument count must match type parameter count.",
      "Provide " + structDef.typeParams.length + " type arguments.",
      node.line,
      node.column,
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
    return errResult(
      "Circular type alias reference detected for '" + node.name + "'",
      "Type aliases cannot reference themselves directly or indirectly.",
      "Remove the circular reference.",
      node.line,
      node.column,
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
    return errResult(
      "Generic struct '" + base + "' requires explicit type annotation",
      "Generic structs need type arguments to resolve type parameters.",
      "Add type annotation like '" + base + "<Type>' to variable declaration.",
      node.line,
      node.column,
    );
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

function checkSingleTypeRef(
  typeName: string,
  structs: StructDef[],
  aliases: TypeAliasDef[],
  node: LetDeclarationNode,
): Result<void, CompileError> {
  const resolved = resolveAlias(typeName, aliases);
  const parsed = parseGenericTypeName(resolved);
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

function analyzeBoolStmt(
  stmt: Statement,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
): Result<void, CompileError> {
  const exprNode = stmt as { line: number; column: number } & Expression;
  const loc = { line: exprNode.line, column: exprNode.column };
  const exprResult = checkExpr(exprNode, scope, structs, aliases, loc);
  if (!exprResult.isOk) return exprResult;
  return { isOk: true, value: undefined };
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
  } else if (
    stmt.type === "LogicalExpression" ||
    stmt.type === "NotExpression"
  ) {
    return analyzeBoolStmt(stmt, scope, structs, aliases);
  } else if (stmt.type === "NumberLiteral") {
    return { isOk: true, value: undefined };
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
      return errResult(
        "Use of undeclared variable '" + baseName + "'",
        "Variable must be declared before use.",
        "Declare the variable with 'let' first.",
        node.line,
        node.column,
      );
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
