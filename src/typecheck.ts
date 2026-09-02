import type { Statement } from "./ast";
import type { CompileError } from "./errors";

export function buildRefMap(statements: Statement[]): Map<string, string> {
  const refMap = new Map<string, string>();
  for (const stmt of statements) {
    if (
      (stmt.kind === "let" || stmt.kind === "letMut") &&
      stmt.init.kind === "addressOf"
    ) {
      const target = stmt.init.target;
      if (target.kind === "ident") {
        refMap.set(stmt.name, target.name);
      }
    } else if (stmt.kind === "block") {
      for (const [k, v] of buildRefMap(stmt.statements)) refMap.set(k, v);
    }
  }
  return refMap;
}

export function checkMutability(
  statements: Statement[],
  finalExpr: Statement,
): CompileError | null {
  const immutable = new Set<string>();
  const mutable = new Set<string>();

  for (const stmt of statements) {
    if (stmt.kind === "let") immutable.add(stmt.name);
    else if (stmt.kind === "letMut") mutable.add(stmt.name);
    else if (stmt.kind === "assign") {
      if (immutable.has(stmt.name) && !mutable.has(stmt.name)) {
        return {
          kind: "type",
          location: { line: 1, column: 1 },
          message: `Cannot assign to immutable variable '${stmt.name}'`,
          fix: `Use 'let mut ${stmt.name}' to declare a mutable variable`,
        };
      }
    } else if (stmt.kind === "block") {
      const err = checkMutability(
        stmt.statements,
        stmt.statements[stmt.statements.length - 1]!,
      );
      if (err) return err;
    }
  }

  if (finalExpr.kind === "assign") {
    if (immutable.has(finalExpr.name) && !mutable.has(finalExpr.name)) {
      return {
        kind: "type",
        location: { line: 1, column: 1 },
        message: `Cannot assign to immutable variable '${finalExpr.name}'`,
        fix: `Use 'let mut ${finalExpr.name}' to declare a mutable variable`,
      };
    }
  }

  return null;
}
