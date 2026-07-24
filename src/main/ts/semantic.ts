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
} from "./types";
import {
  checkAssignmentUndeclared,
  checkAssignmentImmutable,
  checkMemberUndeclared,
  checkMemberImmutable,
} from "./semantic-errors";
import {
  parseGenericTypeName,
  checkTypeName,
  checkExpr,
  checkRef,
  resolveFieldTypeWithGenerics,
} from "./semantic-generics";
import type { StructDef, VarEntry } from "./semantic-generics";

const VALID_TYPES = ["U8", "U16", "U32", "U64", "I8", "I16", "I32", "I64"];

function checkStructDef(
  node: StructDefinitionNode,
  structs: StructDef[],
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
      const { base: fieldBase, args: fieldArgs } = parseGenericTypeName(
        field.typeName,
      );
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

function checkGenericStructInstantiation(
  node: LetDeclarationNode,
  structs: StructDef[],
): Result<void, CompileError> {
  if (node.typeName || node.value.type !== "StructInstance")
    return { isOk: true, value: undefined };
  const sexpr = node.value as { structName: string; typeArgs: string[] };
  const structDef = structs.find((s) => s.name === sexpr.structName);
  if (
    structDef &&
    structDef.typeParams.length > 0 &&
    sexpr.typeArgs.length === 0
  )
    return {
      isOk: false,
      error: {
        message:
          "Generic struct '" +
          sexpr.structName +
          "' requires explicit type annotation",
        reason:
          "Generic structs need type arguments to resolve type parameters.",
        suggestedFix:
          "Add type annotation like '" +
          sexpr.structName +
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
): Result<void, CompileError> {
  const typeCheck = checkLetType(node, structs);
  if (!typeCheck.isOk) return typeCheck;
  const genericCheck = checkGenericStructInstantiation(node, structs);
  if (!genericCheck.isOk) return genericCheck;
  const exprTypeResult = checkExpr(node.value, scope, structs, node);
  if (!exprTypeResult.isOk) return exprTypeResult;
  const exprType = exprTypeResult.value;
  const resolvedTypeName =
    node.typeName ||
    (exprType && structs.some((s) => s.name === exprType)
      ? exprType
      : undefined);
  node.typeName = resolvedTypeName;
  const exprCheck = checkLetExprType(node, scope, structs);
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
): Result<void, CompileError> {
  if (!node.typeName) return { isOk: true, value: undefined };
  const { base, args } = parseGenericTypeName(node.typeName);
  const isNumeric = VALID_TYPES.includes(base);
  const structDef = structs.find((s) => s.name === base);
  if (!isNumeric && !structDef)
    return checkTypeName(base, structs, node, "Invalid type '");
  // Validate type args count matches struct type params
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
): Result<void, CompileError> {
  const exprTypeResult = checkExpr(node.value, scope, structs, node);
  if (!exprTypeResult.isOk) return exprTypeResult;
  const exprType = exprTypeResult.value;
  // Allow struct type inference: let p = Point { ... } infers Point type
  if (!node.typeName && exprType && structs.some((s) => s.name === exprType))
    return { isOk: true, value: undefined };
  // For generic structs, compare base types (e.g. Point<I32> matches Point)
  if (node.typeName && exprType) {
    const { base } = parseGenericTypeName(node.typeName);
    if (base === exprType) return { isOk: true, value: undefined };
  }
  return checkTypeMatch(node.typeName, exprType, node);
}

function checkAssignmentSemantics(
  node: AssignmentNode,
  scope: VarEntry[],
  structs: StructDef[],
): Result<void, CompileError> {
  const entry = scope.find((e) => e.name === node.name);
  if (!entry) return checkAssignmentUndeclared(node);
  if (!entry.mutable) return checkAssignmentImmutable(node);
  const rhsResult = checkAssignmentRhsType(node, scope, entry, structs);
  return rhsResult;
}

function checkAssignmentRhsType(
  node: AssignmentNode,
  scope: VarEntry[],
  entry: VarEntry,
  structs: StructDef[],
): Result<void, CompileError> {
  const rhsTypeResult = checkExpr(node.value, scope, structs, node);
  if (!rhsTypeResult.isOk) return rhsTypeResult;
  const rhsType = rhsTypeResult.value;
  if (!entry.typeName) return { isOk: true, value: undefined };
  return checkTypeMatch(entry.typeName, rhsType, node);
}

function checkMemberAssignment(
  node: MemberAssignmentNode,
  scope: VarEntry[],
  structs: StructDef[],
): Result<void, CompileError> {
  const baseName = getBaseName(node.object);
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
  );
  if (!fieldResult) return { isOk: true, value: undefined };
  const rhsTypeResult = checkExpr(node.value, scope, structs, node);
  if (!rhsTypeResult.isOk) return rhsTypeResult;
  const rhsType = rhsTypeResult.value;
  return checkTypeMatch(fieldResult, rhsType, node);
}

function getBaseName(expr: Expression): string {
  if (expr.type === "Identifier") {
    const idExpr = expr as { name: string };
    return idExpr.name;
  }
  if (expr.type === "MemberExpression") {
    const mexpr = expr as { object: Expression };
    return getBaseName(mexpr.object);
  }
  return "_";
}

function typeError(
  message: string,
  reason: string,
  suggestedFix: string,
  loc: { line: number; column: number },
): Result<void, CompileError> {
  return {
    isOk: false,
    error: {
      message,
      reason,
      suggestedFix,
      line: loc.line,
      column: loc.column,
    },
  };
}

function checkTypeMatch(
  declaredType: string | undefined,
  exprType: string | undefined,
  loc: { line: number; column: number },
): Result<void, CompileError> {
  if (declaredType) {
    if (!exprType)
      return typeError(
        "Type mismatch: expected '" +
          declaredType +
          "' but literal has no type suffix",
        "Typed declarations require a matching type suffix on the literal.",
        "Add '" + declaredType + "' suffix to the literal.",
        loc,
      );
    if (exprType !== declaredType)
      return typeError(
        "Type mismatch: expected '" +
          declaredType +
          "' but got '" +
          exprType +
          "'",
        "Literal type must match the declared type.",
        "Change the literal suffix to '" + declaredType + "'.",
        loc,
      );
  } else if (exprType) {
    return typeError(
      "Literal has type suffix '" + exprType + "' but no type annotation",
      "Type suffixes require a matching type annotation on the variable.",
      "Add ': " + exprType + "' type annotation to the declaration.",
      loc,
    );
  }
  return { isOk: true, value: undefined };
}

export function analyzeSemantics(
  statements: Statement[],
): Result<Statement[], CompileError> {
  const scope: VarEntry[] = [];
  const structs: StructDef[] = [];
  for (const stmt of statements) {
    const result = analyzeStatement(stmt, scope, structs);
    if (!result.isOk) return result;
  }
  return { isOk: true, value: statements };
}

function analyzeStatement(
  stmt: Statement,
  scope: VarEntry[],
  structs: StructDef[],
): Result<void, CompileError> {
  if (stmt.type === "StructDefinition") {
    const node = stmt as StructDefinitionNode;
    return checkStructDef(node, structs);
  } else if (stmt.type === "LetDeclaration") {
    const node = stmt as LetDeclarationNode;
    return checkLetSemantics(node, scope, structs);
  } else if (stmt.type === "Assignment") {
    const node = stmt as AssignmentNode;
    return checkAssignmentSemantics(node, scope, structs);
  } else if (stmt.type === "MemberAssignment") {
    const node = stmt as MemberAssignmentNode;
    return checkMemberAssignment(node, scope, structs);
  } else if (stmt.type === "Identifier") {
    const node = stmt as IdentifierNode;
    return checkIdentifierStatement(node, scope, structs);
  }
  return { isOk: true, value: undefined };
}

function checkIdentifierStatement(
  node: IdentifierNode,
  scope: VarEntry[],
  structs: StructDef[],
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
    return validateFieldChain(parts, entry.typeName, structs);
  }
  const refResult = checkRef(node.name, scope, node);
  if (!refResult.isOk) return refResult;
  return { isOk: true, value: undefined };
}

function validateFieldChain(
  parts: string[],
  initialType: string | undefined,
  structs: StructDef[],
): Result<void, CompileError> {
  let currentType = initialType;
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
