import type { Result, CompileError, StructDef } from "./types";

export function checkStructUndefined(
  structName: string,
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> {
  return {
    isOk: false,
    error: {
      message: "Undefined struct '" + structName + "'",
      reason: "Struct must be defined before use.",
      suggestedFix: "Add 'struct " + structName + " { ... }' before this line.",
      line: loc.line,
      column: loc.column,
    },
  };
}

export function checkStructFieldCount(
  structName: string,
  expected: number,
  actual: number,
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> {
  return {
    isOk: false,
    error: {
      message:
        "Struct '" +
        structName +
        "' expects " +
        expected +
        " field(s) but got " +
        actual,
      reason: "Struct instance must have all fields.",
      suggestedFix: "Provide all " + expected + " fields.",
      line: loc.line,
      column: loc.column,
    },
  };
}

export function checkStructUnknownField(
  fieldName: string,
  structName: string,
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> {
  return {
    isOk: false,
    error: {
      message:
        "Unknown field '" + fieldName + "' on struct '" + structName + "'",
      reason: "Field does not exist on struct.",
      suggestedFix: "Use a valid field name.",
      line: loc.line,
      column: loc.column,
    },
  };
}

export function checkStructFieldType(
  fieldName: string,
  expected: string,
  actual: string | undefined,
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> {
  return {
    isOk: false,
    error: {
      message:
        "Type mismatch: field '" +
        fieldName +
        "' expects '" +
        expected +
        "' but got '" +
        (actual || "unknown") +
        "'",
      reason: "Field value type must match struct field type.",
      suggestedFix: "Use a value of type '" + expected + "'.",
      line: loc.line,
      column: loc.column,
    },
  };
}

export function checkAssignmentUndeclared(node: {
  name: string;
  line: number;
  column: number;
}): Result<void, CompileError> {
  return {
    isOk: false,
    error: {
      message: "Cannot assign to undeclared variable '" + node.name + "'",
      reason: "Variable must be declared before assignment.",
      suggestedFix: "Declare the variable with 'let' first.",
      line: node.line,
      column: node.column,
    },
  };
}

export function checkAssignmentImmutable(node: {
  name: string;
  line: number;
  column: number;
}): Result<void, CompileError> {
  return {
    isOk: false,
    error: {
      message: "Cannot reassign immutable variable '" + node.name + "'",
      reason: "Variable was declared without 'mut'.",
      suggestedFix: "Use 'let mut' to declare a mutable variable.",
      line: node.line,
      column: node.column,
    },
  };
}

export function checkMemberUndeclared(
  loc: { line: number; column: number },
  baseName: string,
): Result<void, CompileError> {
  return {
    isOk: false,
    error: {
      message: "Cannot access field on undeclared variable '" + baseName + "'",
      reason: "Variable must be declared before use.",
      suggestedFix: "Declare the variable with 'let' first.",
      line: loc.line,
      column: loc.column,
    },
  };
}

export function checkMemberImmutable(
  loc: { line: number; column: number },
  baseName: string,
): Result<void, CompileError> {
  return {
    isOk: false,
    error: {
      message:
        "Cannot assign to field of immutable variable '" + baseName + "'",
      reason: "Variable was declared without 'mut'.",
      suggestedFix: "Use 'let mut' to declare a mutable variable.",
      line: loc.line,
      column: loc.column,
    },
  };
}

export function checkTypeMismatch(
  expected: string,
  actual: string | undefined,
  loc: { line: number; column: number },
): Result<void, CompileError> {
  if (expected === actual) return { isOk: true, value: undefined };
  return {
    isOk: false,
    error: {
      message:
        "Type mismatch: expected '" +
        expected +
        "' but got '" +
        (actual || "unknown") +
        "'",
      reason: "Expression type does not match expected type.",
      suggestedFix: "Use a value of type '" + expected + "'.",
      line: loc.line,
      column: loc.column,
    },
  };
}

export function checkTypeMatch(
  declaredType: string | undefined,
  exprType: string | undefined,
  loc: { line: number; column: number },
): Result<void, CompileError> {
  function err(
    msg: string,
    reason: string,
    fix: string,
  ): Result<void, CompileError> {
    return {
      isOk: false,
      error: {
        message: msg,
        reason,
        suggestedFix: fix,
        line: loc.line,
        column: loc.column,
      },
    };
  }
  if (declaredType) {
    if (!exprType)
      return err(
        "Type mismatch: expected '" +
          declaredType +
          "' but literal has no type suffix",
        "Typed declarations require a matching type suffix on the literal.",
        "Add '" + declaredType + "' suffix to the literal.",
      );
    if (exprType !== declaredType)
      return err(
        "Type mismatch: expected '" +
          declaredType +
          "' but got '" +
          exprType +
          "'",
        "Literal type must match the declared type.",
        "Change the literal suffix to '" + declaredType + "'.",
      );
  } else if (exprType && exprType !== "Bool") {
    return err(
      "Literal has type suffix '" + exprType + "' but no type annotation",
      "Type suffixes require a matching type annotation on the variable.",
      "Add ': " + exprType + "' type annotation to the declaration.",
    );
  }
  return { isOk: true, value: undefined };
}

export function checkTypeArgCount(
  structName: string,
  typeArgs: string[],
  def: StructDef,
  loc: { line: number; column: number },
): Result<void, CompileError> {
  if (typeArgs.length > 0 && typeArgs.length !== def.typeParams.length)
    return {
      isOk: false,
      error: {
        message:
          "Struct '" +
          structName +
          "' expects " +
          def.typeParams.length +
          " type param(s) but got " +
          typeArgs.length,
        reason: "Type argument count must match type parameter count.",
        suggestedFix: "Provide " + def.typeParams.length + " type arguments.",
        line: loc.line,
        column: loc.column,
      },
    };
  return { isOk: true, value: undefined };
}
