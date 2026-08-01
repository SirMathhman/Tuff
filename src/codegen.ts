import type { ASTNode, StructInitField, ThisNode } from "./ast";
import type { Result } from "./result";
import { ok, map, andThen } from "./result";
import type { CompileError } from "./compileError";

// Generate the comma-separated JS for a list of argument expressions.
function generateArgs(
  nodes: ASTNode[],
  thisName: string,
): Result<string, CompileError> {
  const parts: string[] = [];
  for (const node of nodes) {
    const result = generateJS(node, false, thisName);
    if (!result.ok) return result;
    parts.push(result.value);
  }
  return ok(parts.join(", "));
}

// Generate the comma-separated "name: value" pairs for a struct initializer.
function generateStructFields(
  fields: StructInitField[],
  thisName: string,
): Result<string, CompileError> {
  const parts: string[] = [];
  for (const field of fields) {
    const result = generateJS(field.value, false, thisName);
    if (!result.ok) return result;
    parts.push(field.name + ": " + result.value);
  }
  return ok(parts.join(", "));
}

export function generateJS(
  node: ASTNode,
  isRedeclare: boolean = false,
  thisName: string = "this",
): Result<string, CompileError> {
  switch (node.kind) {
    case "number":
      return ok(String(node.value));

    case "boolean":
      return ok(String(node.value));

    case "identifier":
      return ok(node.name);

    case "let_decl":
      // A `let` declaration emits `let name = value;` (or `name = value;`
      // when redeclaring an existing top-level variable).
      return map(generateJS(node.value, false, thisName), (value) => {
        return (isRedeclare ? "" : "let ") + node.name + " = " + value + ";";
      });

    case "this":
      // `this` is a compile-time scope reference; it only appears as the
      // object of a member access (this.x), which is handled there. On its
      // own it has no runtime representation. When `this` is a receiver
      // parameter, it emits the renamed JS identifier.
      return ok(thisName);

    case "member_access":
      // `this.x` behavior depends on the role of `this`, resolved by the
      // checker: a bare scope reference (`this.x` = variable `x`) emits the
      // bare property name; a receiver parameter (`this.x` = field on the
      // receiver) emits a field access on the renamed receiver. The
      // constructor role is handled by the fn_decl constructor path.
      if (node.object.kind === "this") {
        if (node.object.thisRole === "receiver") {
          return ok(thisName + "[" + JSON.stringify(node.property) + "]");
        }
        return ok(node.property);
      }
      return map(generateJS(node.object, false, thisName), (object) => {
        return object + "[" + JSON.stringify(node.property) + "]";
      });

    case "binary_op":
      return andThen(generateJS(node.left, false, thisName), (left) => {
        return map(generateJS(node.right, false, thisName), (right) => {
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

    case "fn_decl": {
      // If a parameter is named `this` (a receiver binding), rename it to a
      // valid JS identifier and rewrite `this` references in the body.
      const hasThisParam = node.params.some((p) => p.name === "this");
      const innerThisName = hasThisParam ? "__this__" : thisName;
      const paramNames = node.params
        .map((p) => (p.name === "this" ? innerThisName : p.name))
        .join(", ");
      // A function is a constructor when its body's `this` resolves to the
      // "constructor" role (the implicit constructor object). The checker
      // resolves this role; codegen just reads it instead of re-deriving it
      // from the body shape and the presence of a `this` parameter.
      let terminalThis: ThisNode | undefined;
      if (node.body.kind === "this") {
        terminalThis = node.body;
      } else if (
        node.body.kind === "member_access" &&
        node.body.object.kind === "this"
      ) {
        terminalThis = node.body.object;
      } else if (node.body.kind === "block") {
        const last = node.body.statements[node.body.statements.length - 1];
        if (last !== undefined && last.kind === "this") {
          terminalThis = last;
        }
      }
      const isConstructor = terminalThis?.thisRole === "constructor";
      if (isConstructor) {
        // Collect the field names: parameters plus any `let` declarations in
        // the body block.
        const fieldNames: string[] = node.params.map((p) => p.name);
        if (node.body.kind === "block") {
          for (const stmt of node.body.statements) {
            if (stmt.kind === "let_decl") {
              fieldNames.push(stmt.name);
            }
          }
        }
        const obj =
          "{ " + fieldNames.map((n) => n + ": " + n).join(", ") + " }";
        // Determine what the function returns: the object itself, a field of
        // it, or (for a block) the block's statements followed by the object.
        let returned: string;
        if (node.body.kind === "member_access") {
          returned =
            "return " + obj + "[" + JSON.stringify(node.body.property) + "];";
        } else if (node.body.kind === "block") {
          const parts: string[] = [];
          for (let i = 0; i < node.body.statements.length - 1; i++) {
            const stmt = node.body.statements[i]!;
            const stmtResult = generateJS(stmt, false, innerThisName);
            if (!stmtResult.ok) return stmtResult;
            parts.push(stmtResult.value + ";");
          }
          returned = parts.join(" ") + " return " + obj + ";";
        } else {
          returned = "return " + obj + ";";
        }
        return ok(
          "function " + node.name + "(" + paramNames + ") { " + returned + " }",
        );
      }
      return map(generateJS(node.body, false, innerThisName), (body) => {
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
    }

    case "call":
      return andThen(generateArgs(node.args, thisName), (args) => {
        return ok(node.name + "(" + args + ")");
      });

    case "ref":
      // A reference is represented uniformly as a getter/setter object so it
      // can be passed around and dereferenced. Both immutable and mutable
      // references expose a `get` closure; a mutable reference additionally
      // exposes a `set` closure that writes back to the target. The closures
      // capture the target expression, so they work for arbitrary expressions
      // (re-evaluated on each access), not just plain variables.
      return map(generateJS(node.value, false, thisName), (value) => {
        if (node.isMut === true) {
          return (
            "({ get: () => " + value + ", set: (v) => { " + value + " = v; } })"
          );
        }
        return "({ get: () => " + value + " })";
      });

    case "deref":
      return map(generateJS(node.value, false, thisName), (value) => {
        return value + ".get()";
      });

    case "deref_assign":
      return andThen(generateJS(node.target, false, thisName), (target) => {
        return map(generateJS(node.value, false, thisName), (value) => {
          return target + ".set(" + value + ")";
        });
      });

    case "assign":
      return map(generateJS(node.value, false, thisName), (value) => {
        return node.name + " = " + value;
      });

    case "array":
      return andThen(generateArgs(node.elements, thisName), (elements) => {
        return ok("[" + elements + "]");
      });

    case "index":
      return andThen(generateJS(node.object, false, thisName), (object) => {
        return map(generateJS(node.index, false, thisName), (index) => {
          return object + "[" + index + "]";
        });
      });

    case "struct_decl":
      // A struct declaration is a no-op at runtime (types are compile-time).
      return ok("");

    case "struct_init":
      return andThen(generateStructFields(node.fields, thisName), (fields) => {
        return ok("({ " + fields + " })");
      });

    case "tuple":
      return andThen(generateArgs(node.elements, thisName), (elements) => {
        return ok("[" + elements + "]");
      });

    case "tuple_index":
      return map(generateJS(node.object, false, thisName), (object) => {
        return object + "[" + node.index + "]";
      });

    case "if":
      return andThen(
        generateJS(node.condition, false, thisName),
        (condition) => {
          return andThen(
            generateJS(node.thenBranch, false, thisName),
            (thenBranch) => {
              if (node.elseBranch === undefined) {
                // No else: the `if` is used as a statement, so emit an if statement.
                return ok("if (" + condition + ") { " + thenBranch + "; }");
              }
              return map(
                generateJS(node.elseBranch, false, thisName),
                (elseBranch) => {
                  return (
                    "(" +
                    condition +
                    " ? " +
                    thenBranch +
                    " : " +
                    elseBranch +
                    ")"
                  );
                },
              );
            },
          );
        },
      );

    case "block": {
      // Evaluate all statements, yielding the last one's value via an IIFE
      const parts: string[] = [];
      for (let i = 0; i < node.statements.length; i++) {
        const stmt = node.statements[i]!;
        const stmtResult = generateJS(stmt, false, thisName);
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
      return andThen(
        generateJS(node.condition, false, thisName),
        (condition) => {
          return map(generateJS(node.body, false, thisName), (body) => {
            return "while (" + condition + ") { " + body + "; }";
          });
        },
      );
  }
}
