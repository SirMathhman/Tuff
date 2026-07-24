import type {
  Result,
  CompileError,
  Expression,
  Statement,
  LetDeclarationNode,
  AssignmentNode,
  IdentifierNode,
} from "./compile";

interface VarEntry {
  name: string;
  mutable: boolean;
}

function checkRef(
  name: string,
  scope: VarEntry[],
  loc: { line: number; column: number },
): Result<void, CompileError> {
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
  return { isOk: true, value: undefined };
}

function checkExpr(
  expr: Expression,
  scope: VarEntry[],
  loc: { line: number; column: number },
): Result<void, CompileError> {
  if (expr.type === "NumberLiteral") return { isOk: true, value: undefined };
  return checkRef(expr.name, scope, loc);
}

export function analyzeSemantics(
  statements: Statement[],
): Result<Statement[], CompileError> {
  const scope: VarEntry[] = [];
  for (const stmt of statements) {
    if (stmt.type === "LetDeclaration") {
      const node = stmt as LetDeclarationNode;
      scope.push({ name: node.name, mutable: node.mutable });
      const r = checkExpr(node.value, scope, node);
      if (!r.isOk) return r;
    } else if (stmt.type === "Assignment") {
      const node = stmt as AssignmentNode;
      const entry = scope.find((e) => e.name === node.name);
      if (!entry)
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
      if (!entry.mutable)
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
      const r = checkExpr(node.value, scope, node);
      if (!r.isOk) return r;
    } else if (stmt.type === "Identifier") {
      const node = stmt as IdentifierNode;
      const r = checkRef(node.name, scope, node);
      if (!r.isOk) return r;
    }
  }
  return { isOk: true, value: statements };
}
