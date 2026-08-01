import type { ASTNode } from "./ast";

export class ScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScopeError";
  }
}

export function validateScope(
  stmts: ASTNode[],
  initialScope: Set<string>,
): void {
  const scope = new Set(initialScope);
  // Track which variables are mutable
  const mutable = new Set<string>();

  function checkNode(node: ASTNode): void {
    switch (node.kind) {
      case "number":
        // Always valid
        break;

      case "identifier":
        if (!scope.has(node.name)) {
          throw new ScopeError(`Undeclared identifier: '${node.name}'`);
        }
        break;

      case "member_access":
        // Only validate the object (the base identifier), property access is always valid
        checkNode(node.object);
        break;

      case "binary_op":
        checkNode(node.left);
        checkNode(node.right);
        break;

      case "assign":
        if (!scope.has(node.name)) {
          throw new ScopeError(`Undeclared identifier: '${node.name}'`);
        }
        if (!mutable.has(node.name)) {
          throw new ScopeError(
            `Cannot assign to immutable variable: '${node.name}'`,
          );
        }
        checkNode(node.value);
        break;

      case "let_decl":
        // Validate the value expression first (RHS)
        checkNode(node.value);
        // Then add the new variable to scope
        scope.add(node.name);
        if (node.isMut) {
          mutable.add(node.name);
        }
        break;
    }
  }

  for (const stmt of stmts) {
    checkNode(stmt);
  }
}
