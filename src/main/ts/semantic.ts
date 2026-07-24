import type {
  Result,
  CompileError,
  Expression,
  Statement,
  LetDeclarationNode,
  AssignmentNode,
  IdentifierNode,
  StructDefinitionNode,
  StructField,
  MemberAssignmentNode,
} from "./types";
import {
  checkStructUndefined,
  checkStructFieldCount,
  checkStructUnknownField,
  checkStructFieldType,
  checkAssignmentUndeclared,
  checkAssignmentImmutable,
  checkMemberUndeclared,
  checkMemberImmutable,
} from "./semantic-errors";

const VALID_TYPES = ["U8", "U16", "U32", "U64", "I8", "I16", "I32", "I64"];

function checkTypeName(
  typeName: string,
  structs: StructDef[],
  loc: { line: number; column: number },
  label: string,
): Result<void, CompileError> {
  const isNumeric = VALID_TYPES.includes(typeName);
  const isStruct = structs.some((s) => s.name === typeName);
  if (!isNumeric && !isStruct)
    return {
      isOk: false,
      error: {
        message: label + "'" + typeName + "'",
        reason:
          "Supported types: " + VALID_TYPES.join(", ") + " or a defined struct",
        suggestedFix: "Use a valid numeric type or struct type.",
        line: loc.line,
        column: loc.column,
      },
    };
  return { isOk: true, value: undefined };
}

interface VarEntry {
  name: string;
  mutable: boolean;
  typeName: string | undefined;
}

interface StructDef {
  name: string;
  fields: StructField[];
}

function checkRef(
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

function checkExpr(
  expr: Expression,
  scope: VarEntry[],
  structs: StructDef[],
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> {
  if (expr.type === "NumberLiteral")
    return { isOk: true, value: (expr as { typeName?: string }).typeName };
  if (expr.type === "StructInstance")
    return checkStructExpr(expr, scope, structs, loc);
  if (expr.type === "MemberExpression")
    return checkMemberExpr(expr, scope, structs, loc);
  const refResult = checkRef(expr.name, scope, loc);
  if (!refResult.isOk) return refResult;
  return { isOk: true, value: refResult.value.typeName };
}

function checkStructExpr(
  expr: Expression,
  scope: VarEntry[],
  structs: StructDef[],
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> {
  const sexpr = expr as {
    structName: string;
    fields: { name: string; value: Expression }[];
  };
  const instanceResult = checkStructInstance(
    sexpr.structName,
    sexpr.fields,
    scope,
    structs,
    loc,
  );
  if (!instanceResult.isOk) return instanceResult;
  return { isOk: true, value: sexpr.structName };
}

function checkMemberExpr(
  expr: Expression,
  scope: VarEntry[],
  structs: StructDef[],
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> {
  const mexpr = expr as { object: Expression; field: string };
  const objResult = checkExpr(mexpr.object, scope, structs, loc);
  if (!objResult.isOk) return objResult;
  const objType = objResult.value;
  if (objType) {
    const structDef = structs.find((s) => s.name === objType);
    if (structDef) return checkStructField(structDef, mexpr.field, loc);
  }
  return { isOk: true, value: objType };
}

function checkStructField(
  structDef: StructDef,
  fieldName: string,
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> {
  const fieldDef = structDef.fields.find((f) => f.name === fieldName);
  if (!fieldDef)
    return {
      isOk: false,
      error: {
        message:
          "Unknown field '" +
          fieldName +
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
    const fieldCheck = checkTypeName(
      field.typeName,
      structs,
      node,
      "Invalid field type ",
    );
    if (!fieldCheck.isOk) return fieldCheck;
  }
  structs.push({ name: node.name, fields: node.fields });
  return { isOk: true, value: undefined };
}

function checkStructInstance(
  structName: string,
  fields: { name: string; value: Expression }[],
  scope: VarEntry[],
  structs: StructDef[],
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> {
  const def = structs.find((s) => s.name === structName);
  if (!def) return checkStructUndefined(structName, loc);
  if (fields.length !== def.fields.length)
    return checkStructFieldCount(
      structName,
      def.fields.length,
      fields.length,
      loc,
    );
  for (const field of fields) {
    const defField = def.fields.find((f) => f.name === field.name);
    if (!defField) return checkStructUnknownField(field.name, structName, loc);
    const typeResult = checkExpr(field.value, scope, structs, loc);
    if (!typeResult.isOk) return typeResult;
    const fieldType = typeResult.value;
    if (fieldType !== defField.typeName)
      return checkStructFieldType(
        field.name,
        defField.typeName,
        fieldType,
        loc,
      );
  }
  return { isOk: true, value: structName };
}

function checkLetSemantics(
  node: LetDeclarationNode,
  scope: VarEntry[],
  structs: StructDef[],
): Result<void, CompileError> {
  const typeCheck = checkLetType(node, structs);
  if (!typeCheck.isOk) return typeCheck;
  const exprCheck = checkLetExprType(node, scope, structs);
  if (!exprCheck.isOk) return exprCheck;
  const exprTypeResult = checkExpr(node.value, scope, structs, node);
  if (!exprTypeResult.isOk) return exprTypeResult;
  const exprType = exprTypeResult.value;
  const resolvedTypeName =
    node.typeName ||
    (exprType && structs.some((s) => s.name === exprType)
      ? exprType
      : undefined);
  node.typeName = resolvedTypeName;
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
  return checkTypeName(node.typeName, structs, node, "Invalid type ");
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
  const fieldType = resolveFieldType(node.object, node.field, structs, scope);
  if (!fieldType) return { isOk: true, value: undefined };
  const rhsTypeResult = checkExpr(node.value, scope, structs, node);
  if (!rhsTypeResult.isOk) return rhsTypeResult;
  const rhsType = rhsTypeResult.value;
  return checkTypeMatch(fieldType, rhsType, node);
}

function resolveFieldType(
  expr: Expression,
  field: string,
  structs: StructDef[],
  scope: VarEntry[],
): string | undefined {
  if (expr.type === "Identifier") {
    const idExpr = expr as { name: string };
    const entry = scope.find((e) => e.name === idExpr.name);
    if (entry && entry.typeName) {
      const structDef = structs.find((s) => s.name === entry.typeName);
      if (structDef) {
        const f = structDef.fields.find((f) => f.name === field);
        return f?.typeName;
      }
    }
  }
  if (expr.type === "MemberExpression") {
    const mexpr = expr as { object: Expression; field: string };
    const objType = resolveFieldType(mexpr.object, mexpr.field, structs, scope);
    if (objType) {
      const structDef = structs.find((s) => s.name === objType);
      if (structDef) {
        const f = structDef.fields.find((f) => f.name === field);
        return f?.typeName;
      }
    }
  }
  return undefined;
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
