import type {
  Result,
  CompileError,
  Expression,
  Statement,
  LetDeclarationNode,
  AssignmentNode,
  MemberAssignmentNode,
  FunctionDefinitionNode,
  StructDef,
  VarEntry,
  TypeAliasDef,
  TypeAliasNode,
  FunctionDef,
  ModuleExportsMap,
  EnumDefinitionNode,
} from "./types";
import { isTupleType } from "./semantic-generics";
import {
  checkAssignmentUndeclared,
  checkAssignmentImmutable,
  checkMemberUndeclared,
  checkMemberImmutable,
  checkTypeMatch,
  errResult,
} from "./semantic-errors";
import { checkExpr } from "./semantic-expr";
import { analyzeSimpleStmt } from "./semantic-stmts";
import {
  resolveFieldTypeWithGenerics,
  resolveAlias,
  registerEnumDef,
  clearRegisteredEnums,
} from "./semantic-generics";
import { checkLetSemantics } from "./semantic-let-checks";
import { checkStructDef, checkTypeAlias } from "./semantic-struct-checks";
import { checkSingleTypeRef } from "./semantic-let-checks";

function checkAssignmentRhsType(
  node: AssignmentNode,
  scope: VarEntry[],
  entry: VarEntry,
  structs: StructDef[],
  aliases: TypeAliasDef[],
  moduleExports?: ModuleExportsMap,
  functions?: FunctionDef[],
): Result<void, CompileError> {
  const rhsTypeResult = checkExpr(node.value, {
    scope,
    structs,
    aliases,
    functions: functions || [],
    loc: node,
    moduleExports,
  });
  if (!rhsTypeResult.isOk) return rhsTypeResult;
  const rhsType = rhsTypeResult.value;
  if (!entry.typeName) return { isOk: true, value: undefined };
  const resolvedDecl = resolveAlias(entry.typeName, aliases);
  return checkTypeMatch(resolvedDecl, rhsType, node);
}

function checkAssignmentSemantics(
  node: AssignmentNode,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
  moduleExports?: ModuleExportsMap,
  functions?: FunctionDef[],
): Result<void, CompileError> {
  const entry = scope.find((e) => e.name === node.name);
  if (!entry) return checkAssignmentUndeclared(node);
  if (!entry.mutable) return checkAssignmentImmutable(node);
  return checkAssignmentRhsType(
    node,
    scope,
    entry,
    structs,
    aliases,
    moduleExports,
    functions,
  );
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
  functions?: FunctionDef[],
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
    functions: functions || [],
    loc: node,
    moduleExports,
  });
  if (!rhsTypeResult.isOk) return rhsTypeResult;
  return checkTypeMatch(fieldResult, rhsTypeResult.value, node);
}

function makeLetDeclNode(
  name: string,
  typeName: string,
  line: number,
  column: number,
): LetDeclarationNode {
  return {
    type: "LetDeclaration",
    name,
    mutable: false,
    typeName,
    value: { type: "Identifier", name } as Expression,
    line,
    column,
  };
}

function checkFunctionParamTypes(
  node: FunctionDefinitionNode,
  structs: StructDef[],
  aliases: TypeAliasDef[],
  typeParams: string[],
): Result<VarEntry[], CompileError> {
  const paramScope: VarEntry[] = [];
  for (const param of node.params) {
    const typeCheck = checkSingleTypeRef(
      param.typeName,
      structs,
      aliases,
      makeLetDeclNode(param.name, param.typeName, node.line, node.column),
      typeParams,
    );
    if (!typeCheck.isOk) return { isOk: false, error: typeCheck.error };
    paramScope.push({
      name: param.name,
      mutable: false,
      typeName: param.typeName,
    });
  }
  return { isOk: true, value: paramScope };
}

function checkFunctionBody(
  node: FunctionDefinitionNode,
  paramScope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
  functions: FunctionDef[],
  moduleExports?: ModuleExportsMap,
): Result<void, CompileError> {
  for (const stmt of node.body) {
    const result = analyzeStatement(
      stmt,
      paramScope,
      structs,
      aliases,
      functions,
      moduleExports,
    );
    if (!result.isOk) return result;
  }
  return { isOk: true, value: undefined };
}

function checkFunctionDef(
  node: FunctionDefinitionNode,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
  functions: FunctionDef[],
  moduleExports?: ModuleExportsMap,
): Result<void, CompileError> {
  const typeParams = node.typeParams || [];
  const paramsResult = checkFunctionParamTypes(
    node,
    structs,
    aliases,
    typeParams,
  );
  if (!paramsResult.isOk) return paramsResult;
  const paramScope = paramsResult.value;
  const returnCheck = checkSingleTypeRef(
    node.returnType,
    structs,
    aliases,
    makeLetDeclNode(node.name, node.returnType, node.line, node.column),
    typeParams,
  );
  if (!returnCheck.isOk) return returnCheck;
  const bodyResult = checkFunctionBody(
    node,
    paramScope,
    structs,
    aliases,
    functions,
    moduleExports,
  );
  if (!bodyResult.isOk) return bodyResult;
  functions.push({
    name: node.name,
    typeParams: node.typeParams,
    params: node.params,
    returnType: node.returnType,
  });
  scope.push({ name: node.name, mutable: false, typeName: "Function" });
  return { isOk: true, value: undefined };
}

export function analyzeSemantics(
  statements: Statement[],
  moduleExports?: ModuleExportsMap,
): Result<Statement[], CompileError> {
  clearRegisteredEnums();
  const scope: VarEntry[] = [];
  const structs: StructDef[] = [];
  const aliases: TypeAliasDef[] = [];
  const functions: FunctionDef[] = [];
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
    } else if (stmt.type === "FunctionDefinition") {
      const chk = checkFunctionDef(
        stmt as FunctionDefinitionNode,
        scope,
        structs,
        aliases,
        functions,
        moduleExports,
      );
      if (!chk.isOk) return chk;
    } else {
      const result = analyzeStatement(
        stmt,
        scope,
        structs,
        aliases,
        functions,
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
  functions: FunctionDef[],
  moduleExports?: ModuleExportsMap,
): Result<void, CompileError> {
  if (stmt.type === "StructDefinition")
    return checkStructDef(stmt as never, structs, aliases);
  if (stmt.type === "LetDeclaration")
    return checkLetSemantics(
      stmt as LetDeclarationNode,
      scope,
      structs,
      aliases,
      moduleExports,
      functions,
    );
  if (stmt.type === "Assignment")
    return checkAssignmentSemantics(
      stmt as AssignmentNode,
      scope,
      structs,
      aliases,
      moduleExports,
      functions,
    );
  if (stmt.type === "MemberAssignment")
    return checkMemberAssignment(
      stmt as MemberAssignmentNode,
      scope,
      structs,
      aliases,
      moduleExports,
      functions,
    );
  return analyzeSimpleStmt(
    stmt,
    scope,
    structs,
    aliases,
    moduleExports,
    functions,
  );
}
