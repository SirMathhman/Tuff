import type {
  Result,
  CompileError,
  Expression,
  Statement,
  LetDeclarationNode,
  AssignmentNode,
  StructDefinitionNode,
  MemberAssignmentNode,
  TypeAliasNode,
  EnumDefinitionNode,
  StructDef,
  VarEntry,
  TypeAliasDef,
  ModuleExportsMap,
} from "./types";
import { isTupleType } from "./semantic-generics";
import {
  checkAssignmentUndeclared,
  checkAssignmentImmutable,
  checkMemberUndeclared,
  checkMemberImmutable,
  checkTypeMatch,
  checkTypeRef,
  errResult,
} from "./semantic-errors";
import { checkExpr } from "./semantic-expr";
import { analyzeSimpleStmt } from "./semantic-stmts";
import {
  parseGenericTypeName,
  checkTypeName,
  resolveFieldTypeWithGenerics,
  checkCircularAlias,
  resolveAlias,
  registerEnumDef,
  clearRegisteredEnums,
} from "./semantic-generics";

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
      const types = resolved.includes(" | ")
        ? resolved.split(" | ").map((a) => a.trim())
        : [resolved];
      for (const t of types) {
        const { base, args } = parseGenericTypeName(t);
        const baseCheck = checkTypeName(
          base,
          structs,
          node,
          "Invalid field type ",
        );
        if (!baseCheck.isOk) return baseCheck;
        for (const arg of args) {
          if (node.typeParams.includes(arg)) continue;
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

function checkAliasUnderlying(
  underlyingType: string,
  typeParams: string[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
  node: TypeAliasNode,
): Result<void, CompileError> {
  for (const arm of underlyingType.split(" | ")) {
    const resolved = resolveAlias(arm, aliases);
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
  moduleExports?: ModuleExportsMap,
): Result<void, CompileError> {
  const typeCheck = checkLetType(node, structs, aliases);
  if (!typeCheck.isOk) return typeCheck;
  const genericCheck = checkGenericStructInstantiation(node, structs, aliases);
  if (!genericCheck.isOk) return genericCheck;
  const exprTypeResult = checkExpr(node.value, {
    scope,
    structs,
    aliases,
    loc: node,
    moduleExports,
  });
  if (!exprTypeResult.isOk) return exprTypeResult;
  const exprType = exprTypeResult.value;
  const resolvedTypeName =
    node.typeName ||
    (exprType && structs.some((s) => s.name === exprType)
      ? exprType
      : undefined);
  node.typeName = resolvedTypeName;
  const exprCheck = checkLetExprType(
    node,
    scope,
    structs,
    aliases,
    moduleExports,
  );
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
  moduleExports?: ModuleExportsMap,
): Result<void, CompileError> {
  const exprTypeResult = checkExpr(node.value, {
    scope,
    structs,
    aliases,
    loc: node,
    moduleExports,
  });
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
  moduleExports?: ModuleExportsMap,
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
    moduleExports,
  );
  return rhsResult;
}
function checkAssignmentRhsType(
  node: AssignmentNode,
  scope: VarEntry[],
  entry: VarEntry,
  structs: StructDef[],
  aliases: TypeAliasDef[],
  moduleExports?: ModuleExportsMap,
): Result<void, CompileError> {
  const rhsTypeResult = checkExpr(node.value, {
    scope,
    structs,
    aliases,
    loc: node,
    moduleExports,
  });
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
  moduleExports?: ModuleExportsMap,
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
  if (entry.typeName && isTupleType(entry.typeName))
    return errResult(
      "Cannot assign to tuple element",
      "Tuple elements are immutable.",
      "Use a struct instead or declare the tuple as mutable (not yet supported).",
      node.line,
      node.column,
    );
  const fieldResult = resolveFieldTypeWithGenerics(
    node.object,
    node.field,
    structs,
    scope,
    aliases,
  );
  if (!fieldResult) return { isOk: true, value: undefined };
  const rhsTypeResult = checkExpr(node.value, {
    scope,
    structs,
    aliases,
    loc: node,
    moduleExports,
  });
  if (!rhsTypeResult.isOk) return rhsTypeResult;
  return checkTypeMatch(fieldResult, rhsTypeResult.value, node);
}

export function analyzeSemantics(
  statements: Statement[],
  moduleExports?: ModuleExportsMap,
): Result<Statement[], CompileError> {
  clearRegisteredEnums();
  const scope: VarEntry[] = [];
  const structs: StructDef[] = [];
  const aliases: TypeAliasDef[] = [];
  for (const s of statements.filter((x) => x.type === "TypeAlias"))
    aliases.push({
      name: (s as TypeAliasNode).name,
      typeParams: (s as TypeAliasNode).typeParams,
      underlyingType: (s as TypeAliasNode).underlyingType,
    });
  for (const stmt of statements) {
    if (stmt.type === "EnumDefinition") {
      const node = stmt as EnumDefinitionNode;
      registerEnumDef({ name: node.name, variants: node.variants });
      scope.push({ name: node.name, mutable: false, typeName: node.name });
    } else if (stmt.type === "TypeAlias") {
      const chk = checkTypeAlias(stmt as TypeAliasNode, structs, aliases);
      if (!chk.isOk) return chk;
    } else {
      const result = analyzeStatement(
        stmt,
        scope,
        structs,
        aliases,
        moduleExports,
      );
      if (!result.isOk) return result;
    }
  }
  return { isOk: true, value: statements };
}

function analyzeStatement(
  stmt: Statement,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
  moduleExports?: ModuleExportsMap,
): Result<void, CompileError> {
  if (stmt.type === "StructDefinition")
    return checkStructDef(stmt as StructDefinitionNode, structs, aliases);
  if (stmt.type === "LetDeclaration")
    return checkLetSemantics(
      stmt as LetDeclarationNode,
      scope,
      structs,
      aliases,
      moduleExports,
    );
  if (stmt.type === "Assignment")
    return checkAssignmentSemantics(
      stmt as AssignmentNode,
      scope,
      structs,
      aliases,
      moduleExports,
    );
  if (stmt.type === "MemberAssignment")
    return checkMemberAssignment(
      stmt as MemberAssignmentNode,
      scope,
      structs,
      aliases,
      moduleExports,
    );
  return analyzeSimpleStmt(stmt, scope, structs, aliases, moduleExports);
}
