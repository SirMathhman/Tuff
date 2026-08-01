import type { ASTNode, StructInitField } from "./ast";
import type { Result } from "./result";
import { ok, err, map, andThen } from "./result";
import type { CompileError } from "./compileError";
import { compileError } from "./compileError";

// Generate the comma-separated JS for a list of argument expressions.
function generateArgs(nodes: ASTNode[]): Result<string, CompileError> {
  const parts: string[] = [];
  for (const node of nodes) {
    const result = generateJS(node);
    if (!result.ok) return result;
    parts.push(result.value);
  }
  return ok(parts.join(", "));
}

// Generate the comma-separated "name: value" pairs for a struct initializer.
function generateStructFields(
  fields: StructInitField[],
): Result<string, CompileError> {
  const parts: string[] = [];
  for (const field of fields) {
    const result = generateJS(field.value);
    if (!result.ok) return result;
    parts.push(field.name + ": " + result.value);
  }
  return ok(parts.join(", "));
}

export function generateJS(node: ASTNode): Result<string, CompileError> {
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
          // Parenthesize nested binary operands so the emitted JS preserves
          // the AST's grouping. Without this, `(2 + 3) * 4` would compile to
          // `2 + 3 * 4` (evaluated as `2 + (3*4) = 14`).
          const leftStr =
            node.left.kind === "binary_op" ? "(" + left + ")" : left;
          const rightStr =
            node.right.kind === "binary_op" ? "(" + right + ")" : right;
          return leftStr + " " + node.op + " " + rightStr;
        });
      });

    case "is":
      // The `is` operator is a compile-time type check; the checker has
      // already computed the boolean result, so emit it directly.
      return ok(String(node.result));

    case "fn_decl":
      return map(generateJS(node.body), (body) => {
        const paramNames = node.params.map((p) => p.name).join(", ");
        return (
          "function " +
          node.name +
          "(" +
          paramNames +
          ") { return " +
          body +
          "; }"
        );
      });

    case "call":
      return andThen(generateArgs(node.args), (args) => {
        return ok(node.name + "(" + args + ")");
      });

    case "ref":
      // A reference is represented uniformly as a getter/setter object so it
      // can be passed around and dereferenced. Both immutable and mutable
      // references expose a `get` closure; a mutable reference additionally
      // exposes a `set` closure that writes back to the target. The closures
      // capture the target expression, so they work for arbitrary expressions
      // (re-evaluated on each access), not just plain variables.
      return map(generateJS(node.value), (value) => {
        if (node.isMut === true) {
          return (
            "({ get: () => " + value + ", set: (v) => { " + value + " = v; } })"
          );
        }
        return "({ get: () => " + value + " })";
      });

    case "deref":
      return map(generateJS(node.value), (value) => {
        return value + ".get()";
      });

    case "deref_assign":
      return andThen(generateJS(node.target), (target) => {
        return map(generateJS(node.value), (value) => {
          return target + ".set(" + value + ")";
        });
      });

    case "assign":
      return map(generateJS(node.value), (value) => {
        return node.name + " = " + value;
      });

    case "array":
      return andThen(generateArgs(node.elements), (elements) => {
        return ok("[" + elements + "]");
      });

    case "index":
      return andThen(generateJS(node.object), (object) => {
        return map(generateJS(node.index), (index) => {
          return object + "[" + index + "]";
        });
      });

    case "struct_decl":
      // A struct declaration is a no-op at runtime (types are compile-time).
      return ok("");

    case "struct_init":
      return andThen(generateStructFields(node.fields), (fields) => {
        return ok("({ " + fields + " })");
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

    case "while":
      return andThen(generateJS(node.condition), (condition) => {
        return map(generateJS(node.body), (body) => {
          return "while (" + condition + ") { " + body + "; }";
        });
      });

    default:
      return err(
        compileError(
          "syntax",
          "Cannot generate JS for node kind: " + node.kind,
        ),
      );
  }
}
