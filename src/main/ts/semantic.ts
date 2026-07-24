import type {
  Result,
  CompileError,
  Expression,
  Statement,
  LetDeclarationNode,
  AssignmentNode,
  IdentifierNode,
} from "./compile";

const VALID_TYPES = ["U8", "U16", "U32", "U64", "I8", "I16", "I32", "I64"];

interface VarEntry {
  name: string;
  mutable: boolean;
  typeName: string | undefined;
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
        message: `Use of undeclared variable '${name}'`,
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
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> {
  if (expr.type === "NumberLiteral") {
    return { isOk: true, value: (expr as { typeName?: string }).typeName };
  }
  const refResult = checkRef(expr.name, scope, loc);
  if (!refResult.isOk) return refResult;
  return { isOk: true, value: refResult.value.typeName };
}

function checkLetSemantics(
  node: LetDeclarationNode,
  scope: VarEntry[],
): Result<void, CompileError> {
  const typeCheck = checkLetType(node);
  if (!typeCheck.isOk) return typeCheck;
  const exprCheck = checkLetExprType(node, scope);
  if (!exprCheck.isOk) return exprCheck;
  scope.push({
    name: node.name,
    mutable: node.mutable,
    typeName: node.typeName,
  });
  return { isOk: true, value: undefined };
}

function checkLetType(node: LetDeclarationNode): Result<void, CompileError> {
  if (node.typeName && !VALID_TYPES.includes(node.typeName))
    return {
      isOk: false,
      error: {
        message: `Invalid type '${node.typeName}'`,
        reason: `Supported types: ${VALID_TYPES.join(", ")}`,
        suggestedFix: "Use a valid numeric type.",
        line: node.line,
        column: node.column,
      },
    };
  return { isOk: true, value: undefined };
}

function checkLetExprType(
  node: LetDeclarationNode,
  scope: VarEntry[],
): Result<void, CompileError> {
  const exprTypeResult = checkExpr(node.value, scope, node);
  if (!exprTypeResult.isOk) return exprTypeResult;
  const exprType = exprTypeResult.value;
  return checkTypeMatch(node.typeName, exprType, node);
}

function checkAssignmentSemantics(
  node: AssignmentNode,
  scope: VarEntry[],
): Result<void, CompileError> {
  const entry = scope.find((e) => e.name === node.name);
  if (!entry) return checkAssignmentUndeclared(node);
  if (!entry.mutable) return checkAssignmentImmutable(node);
  const rhsResult = checkAssignmentRhsType(node, scope, entry);
  return rhsResult;
}

function checkAssignmentUndeclared(
  node: AssignmentNode,
): Result<void, CompileError> {
  return {
    isOk: false,
    error: {
      message: `Cannot assign to undeclared variable '${node.name}'`,
      reason: "Variable must be declared before assignment.",
      suggestedFix: "Declare the variable with 'let' first.",
      line: node.line,
      column: node.column,
    },
  };
}

function checkAssignmentImmutable(
  node: AssignmentNode,
): Result<void, CompileError> {
  return {
    isOk: false,
    error: {
      message: `Cannot reassign immutable variable '${node.name}'`,
      reason: "Variable was declared without 'mut'.",
      suggestedFix: "Use 'let mut' to declare a mutable variable.",
      line: node.line,
      column: node.column,
    },
  };
}

function checkAssignmentRhsType(
  node: AssignmentNode,
  scope: VarEntry[],
  entry: VarEntry,
): Result<void, CompileError> {
  const rhsTypeResult = checkExpr(node.value, scope, node);
  if (!rhsTypeResult.isOk) return rhsTypeResult;
  const rhsType = rhsTypeResult.value;
  if (!entry.typeName) return { isOk: true, value: undefined };
  return checkTypeMatch(entry.typeName, rhsType, node);
}

function checkTypeMatch(
  declaredType: string | undefined,
  exprType: string | undefined,
  loc: { line: number; column: number },
): Result<void, CompileError> {
  if (declaredType) {
    if (!exprType)
      return {
        isOk: false,
        error: {
          message: `Type mismatch: expected '${declaredType}' but literal has no type suffix`,
          reason:
            "Typed declarations require a matching type suffix on the literal.",
          suggestedFix: `Add '${declaredType}' suffix to the literal.`,
          line: loc.line,
          column: loc.column,
        },
      };
    if (exprType !== declaredType)
      return {
        isOk: false,
        error: {
          message: `Type mismatch: expected '${declaredType}' but got '${exprType}'`,
          reason: "Literal type must match the declared type.",
          suggestedFix: `Change the literal suffix to '${declaredType}'.`,
          line: loc.line,
          column: loc.column,
        },
      };
  } else if (exprType) {
    return {
      isOk: false,
      error: {
        message: `Literal has type suffix '${exprType}' but no type annotation`,
        reason:
          "Type suffixes require a matching type annotation on the variable.",
        suggestedFix: `Add ': ${exprType}' type annotation to the declaration.`,
        line: loc.line,
        column: loc.column,
      },
    };
  }
  return { isOk: true, value: undefined };
}

export function analyzeSemantics(
  statements: Statement[],
): Result<Statement[], CompileError> {
  const scope: VarEntry[] = [];
  for (const stmt of statements) {
    if (stmt.type === "LetDeclaration") {
      const node = stmt as LetDeclarationNode;
      const result = checkLetSemantics(node, scope);
      if (!result.isOk) return result;
    } else if (stmt.type === "Assignment") {
      const node = stmt as AssignmentNode;
      const result = checkAssignmentSemantics(node, scope);
      if (!result.isOk) return result;
    } else if (stmt.type === "Identifier") {
      const node = stmt as IdentifierNode;
      const refResult = checkRef(node.name, scope, node);
      if (!refResult.isOk) return refResult;
    }
  }
  return { isOk: true, value: statements };
}
