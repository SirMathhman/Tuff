import type {
  Result,
  CompileError,
  Expression,
  Statement,
  IdentifierNode,
  VarEntry,
  StructDef,
  TypeAliasDef,
  FunctionDef,
  ModuleExportsMap,
  CheckCtx,
} from "./types";
import { checkRef, resolveFieldChainType } from "./semantic-generics";
import { errResult } from "./semantic-errors";
import { checkExpr } from "./semantic-expr";

function buildCheckCtx(
  exprNode: { line: number; column: number },
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
  moduleExports?: ModuleExportsMap,
  functions?: FunctionDef[],
): CheckCtx {
  return {
    scope,
    structs,
    aliases,
    functions: functions || [],
    loc: { line: exprNode.line, column: exprNode.column },
    moduleExports,
  };
}

function analyzeBoolStmt(
  stmt: Statement,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
  moduleExports?: ModuleExportsMap,
  functions?: FunctionDef[],
): Result<void, CompileError> {
  const exprNode = stmt as { line: number; column: number } & Expression;
  const ctx = buildCheckCtx(
    exprNode,
    scope,
    structs,
    aliases,
    moduleExports,
    functions,
  );
  const exprResult = checkExpr(exprNode, ctx);
  if (!exprResult.isOk) return exprResult;
  return { isOk: true, value: undefined };
}

function isBoolOrMemberExpr(stmt: Statement): boolean {
  return (
    stmt.type === "LogicalExpression" ||
    stmt.type === "NotExpression" ||
    stmt.type === "MemberExpression" ||
    stmt.type === "BinaryExpression" ||
    stmt.type === "FunctionCall"
  );
}

function strExitErr(node: {
  line: number;
  column: number;
}): Result<void, CompileError> {
  return errResult(
    "String value cannot be used as an exit expression",
    "String values cannot be converted to a valid exit code.",
    "Use a numeric, boolean, or struct expression.",
    node.line,
    node.column,
  );
}

function checkIdentifierStatement(
  node: IdentifierNode,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
): Result<void, CompileError> {
  if (!node.name) return { isOk: true, value: undefined };
  if (node.name.includes(".")) {
    const parts = node.name.split(".");
    const entry = scope.find((e) => e.name === parts[0]);
    if (!entry)
      return errResult(
        "Use of undeclared variable '" + parts[0] + "'",
        "Variable must be declared before use.",
        "Declare the variable with 'let' first.",
        node.line,
        node.column,
      );
    const resolvedType = resolveFieldChainType(
      parts,
      entry.typeName,
      structs,
      aliases,
    );
    if (resolvedType === "Str") return strExitErr(node);
    return { isOk: true, value: undefined };
  }
  const refResult = checkRef(node.name, scope, node);
  if (!refResult.isOk) return refResult;
  if (refResult.value.typeName === "Str") return strExitErr(node);
  return { isOk: true, value: undefined };
}

function analyzeModuleAccessStmt(
  exprNode: { line: number; column: number } & Expression,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
  moduleExports?: ModuleExportsMap,
  functions?: FunctionDef[],
): Result<void, CompileError> {
  const ctx = buildCheckCtx(
    exprNode,
    scope,
    structs,
    aliases,
    moduleExports,
    functions,
  );
  const exprResult = checkExpr(exprNode, ctx);
  if (!exprResult.isOk) return exprResult;
  const exprType = exprResult.value;
  if (exprType === "Str") return strExitErr(exprNode);
  return { isOk: true, value: undefined };
}

function analyzeSimpleStmt(
  stmt: Statement,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
  moduleExports?: ModuleExportsMap,
  functions?: FunctionDef[],
): Result<void, CompileError> {
  if (stmt.type === "Identifier")
    return checkIdentifierStatement(
      stmt as IdentifierNode,
      scope,
      structs,
      aliases,
    );
  if (stmt.type === "ModuleAccess")
    return analyzeModuleAccessStmt(
      stmt as { line: number; column: number } & Expression,
      scope,
      structs,
      aliases,
      moduleExports,
      functions,
    );
  if (stmt.type === "NumberLiteral") return { isOk: true, value: undefined };
  if (stmt.type === "StringLiteral")
    return strExitErr(stmt as { line: number; column: number });
  if (
    stmt.type === "BinaryExpression" ||
    stmt.type === "FunctionCall" ||
    stmt.type === "IsExpression"
  )
    return analyzeBoolStmt(
      stmt,
      scope,
      structs,
      aliases,
      moduleExports,
      functions,
    );
  return analyzeOtherStmt(
    stmt,
    scope,
    structs,
    aliases,
    moduleExports,
    functions,
  );
}

function analyzeOtherStmt(
  stmt: Statement,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
  moduleExports?: ModuleExportsMap,
  functions?: FunctionDef[],
): Result<void, CompileError> {
  if (isBoolOrMemberExpr(stmt))
    return analyzeBoolStmt(
      stmt,
      scope,
      structs,
      aliases,
      moduleExports,
      functions,
    );
  return { isOk: true, value: undefined };
}

export { analyzeSimpleStmt, strExitErr };
