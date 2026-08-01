import type { ASTNode } from "./ast";
import type { Result } from "./result";
import { ok, err, map, andThen } from "./result";

export function generateJS(node: ASTNode): Result<string, Error> {
  switch (node.kind) {
    case "number":
      return ok(String(node.value));

    case "boolean":
      return ok(String(node.value));

    case "identifier":
      return ok(node.name);

    case "member_access":
      return map(generateJS(node.object), (object) => {
        return object + "[" + JSON.stringify(node.property) + "]";
      });

    case "binary_op":
      return andThen(generateJS(node.left), (left) => {
        return map(generateJS(node.right), (right) => {
          return left + " " + node.op + " " + right;
        });
      });

    case "assign":
      return map(generateJS(node.value), (value) => {
        return node.name + " = " + value;
      });

    case "if":
      return andThen(generateJS(node.condition), (condition) => {
        return andThen(generateJS(node.thenBranch), (thenBranch) => {
          if (node.elseBranch === undefined) {
            // No else: the `if` is used as a statement, so emit an if statement.
            return ok("if (" + condition + ") { " + thenBranch + "; }");
          }
          return map(generateJS(node.elseBranch), (elseBranch) => {
            return (
              "(" + condition + " ? " + thenBranch + " : " + elseBranch + ")"
            );
          });
        });
      });

    case "block": {
      // Evaluate all statements, yielding the last one's value via an IIFE
      const parts: string[] = [];
      for (let i = 0; i < node.statements.length; i++) {
        const stmt = node.statements[i]!;
        const stmtResult = generateJS(stmt);
        if (!stmtResult.ok) return stmtResult;
        if (i === node.statements.length - 1) {
          parts.push("return " + stmtResult.value + ";");
        } else {
          parts.push(stmtResult.value + ";");
        }
      }
      return ok("(() => { " + parts.join(" ") + " })()");
    }

    default:
      return err(new Error("Cannot generate JS for node kind: " + node.kind));
  }
}
