import type { ASTNode, StructInitField } from "./ast";
import type { Result } from "./result";
import { ok, map, andThen } from "./result";
import type { CompileError } from "./compileError";

// Generate the comma-separated JS for a list of argument expressions.
function generateArgs(
  nodes: ASTNode[],
  thisName: string,
  hoisted: string[],
  outerThisName: string | undefined,
): Result<string, CompileError> {
  const parts: string[] = [];
  for (const node of nodes) {
    const result = generateJS(node, false, thisName, hoisted, outerThisName);
    if (!result.ok) return result;
    parts.push(result.value);
  }
  return ok(parts.join(", "));
}

// Generate the comma-separated "name: value" pairs for a struct initializer.
function generateStructFields(
  fields: StructInitField[],
  thisName: string,
  hoisted: string[],
  outerThisName: string | undefined,
): Result<string, CompileError> {
  const parts: string[] = [];
  for (const field of fields) {
    const result = generateJS(
      field.value,
      false,
      thisName,
      hoisted,
      outerThisName,
    );
    if (!result.ok) return result;
    parts.push(field.name + ": " + result.value);
  }
  return ok(parts.join(", "));
}

export function generateJS(
  node: ASTNode,
  isRedeclare: boolean = false,
  thisName: string = "this",
  hoisted: string[] = [],
  outerThisName: string | undefined = undefined,
): Result<string, CompileError> {
  switch (node.kind) {
    case "number":
      return ok(String(node.value));

    case "boolean":
      return ok(String(node.value));

    case "identifier":
      // A bare identifier that the checker marked as a capture of an
      // enclosing constructor's field emits `outer.field` (a field access on
      // the enclosing instance) rather than a plain variable reference.
      if (node.capturedField === true && outerThisName !== undefined) {
        return ok(outerThisName + "[" + JSON.stringify(node.name) + "]");
      }
      return ok(node.name);

    case "let_decl":
      // A `let` declaration emits `let name = value;` (or `name = value;`
      // when redeclaring an existing top-level variable).
      return map(generateJS(node.value, false, thisName, hoisted), (value) => {
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
      // receiver) emits a field access on the renamed receiver. When the
      // receiver is a reference (`&Wrapper`), the field access dereferences
      // it first (`this.get()["x"]`). The constructor role is handled by the
      // fn_decl constructor path.
      if (node.object.kind === "this") {
        if (node.object.thisRole === "receiver") {
          if (node.object.thisIsRef === true) {
            return ok(
              thisName + ".get()[" + JSON.stringify(node.property) + "]",
            );
          }
          return ok(thisName + "[" + JSON.stringify(node.property) + "]");
        }
        // `this.this^k` climbs k frames outward. When the climb target is the
        // immediate enclosing frame (k=1), it emits the enclosing instance
        // name (`outerThisName`). Deeper climbs are not yet supported at
        // runtime.
        if (node.property === "this" && outerThisName !== undefined) {
          return ok(outerThisName);
        }
        return ok(node.property);
      }
      // A `this.this^k.field` access that resolves to a Module (top-level
      // scope) field emits the bare property name — a plain variable
      // reference — since Module's fields are the top-level variables.
      if (node.moduleField === true) {
        return ok(node.property);
      }
      return map(
        generateJS(node.object, false, thisName, hoisted, outerThisName),
        (object) => {
          return object + "[" + JSON.stringify(node.property) + "]";
        },
      );

    case "binary_op":
      return andThen(
        generateJS(node.left, false, thisName, hoisted, outerThisName),
        (left) => {
          return map(
            generateJS(node.right, false, thisName, hoisted, outerThisName),
            (right) => {
              // Parenthesize nested binary operands so the emitted JS preserves
              // the AST's grouping. Without this, `(2 + 3) * 4` would compile to
              // `2 + 3 * 4` (evaluated as `2 + (3*4) = 14`).
              const leftStr =
                node.left.kind === "binary_op" ? "(" + left + ")" : left;
              const rightStr =
                node.right.kind === "binary_op" ? "(" + right + ")" : right;
              return leftStr + " " + node.op + " " + rightStr;
            },
          );
        },
      );

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
      // A function is a constructor when the checker recorded it as one. The
      // checker resolves constructor-ness from the body shape once; codegen
      // just reads the recorded fact instead of re-deriving it.
      const isConstructor = node.isConstructor === true;
      if (isConstructor) {
        // A constructor whose body is `this is X` (a type check on the
        // constructor object) returns the `is` result, not the object. Emit
        // it like a normal expression body.
        if (node.body.kind === "is") {
          return map(
            generateJS(node.body, false, innerThisName, hoisted, outerThisName),
            (body) => {
              return (
                "function " +
                node.name +
                "(" +
                paramNames +
                ") { return " +
                body +
                "; }"
              );
            },
          );
        }
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
        // The instance object is built as `__self__` so nested closures can
        // close over it (for `this.this` and captured-field access). The
        // object's fields are the parameters plus the top-level `let`s.
        const selfName = "__self__";
        const obj =
          "{ " + fieldNames.map((n) => n + ": " + n).join(", ") + " }";
        // Determine what the function returns: the object itself, a field of
        // it, or (for a block) the block's statements followed by the object.
        let returned: string;
        if (node.body.kind === "member_access") {
          returned =
            "return " + obj + "[" + JSON.stringify(node.body.property) + "];";
        } else if (node.body.kind === "block") {
          const last = node.body.statements[node.body.statements.length - 1];
          // A constructor block ending in `this is X` returns the `is` result
          // (a type check on the constructor object), not the object.
          const returnsIsResult = last !== undefined && last.kind === "is";
          // Emit the field declarations and other statements first (in order),
          // so the instance object `__self__` can be built from the declared
          // fields. Nested closures are emitted after `__self__` exists so
          // they can close over it.
          const preStatements: string[] = [];
          const closureStatements: string[] = [];
          for (let i = 0; i < node.body.statements.length - 1; i++) {
            const stmt = node.body.statements[i]!;
            // A nested function that captures enclosing state is a closure:
            // emit it inline (it closes over the enclosing locals and the
            // instance `__self__`), then attach it to the instance so it's
            // reachable as `.name()`. A self-contained nested function is
            // hoisted to the top level.
            if (stmt.kind === "fn_decl") {
              const fnResult = generateJS(
                stmt,
                false,
                innerThisName,
                hoisted,
                selfName,
              );
              if (!fnResult.ok) return fnResult;
              if (stmt.capturesOuter === true) {
                closureStatements.push(fnResult.value + ";");
                closureStatements.push(
                  selfName +
                    "[" +
                    JSON.stringify(stmt.name) +
                    "] = " +
                    stmt.name +
                    ";",
                );
              } else {
                hoisted.push(fnResult.value);
              }
              continue;
            }
            const stmtResult = generateJS(
              stmt,
              false,
              innerThisName,
              hoisted,
              selfName,
            );
            if (!stmtResult.ok) return stmtResult;
            preStatements.push(stmtResult.value + ";");
          }
          const selfDecl = "const " + selfName + " = " + obj + ";";
          if (returnsIsResult) {
            const lastResult = generateJS(
              last!,
              false,
              innerThisName,
              hoisted,
              selfName,
            );
            if (!lastResult.ok) return lastResult;
            returned =
              preStatements.join(" ") +
              " " +
              selfDecl +
              " " +
              closureStatements.join(" ") +
              " return " +
              lastResult.value +
              ";";
          } else {
            returned =
              preStatements.join(" ") +
              " " +
              selfDecl +
              " " +
              closureStatements.join(" ") +
              " return " +
              selfName +
              ";";
          }
        } else {
          returned = "return " + obj + ";";
        }
        return ok(
          "function " + node.name + "(" + paramNames + ") { " + returned + " }",
        );
      }
      return map(
        generateJS(node.body, false, innerThisName, hoisted, outerThisName),
        (body) => {
          return (
            "function " +
            node.name +
            "(" +
            paramNames +
            ") { return " +
            body +
            "; }"
          );
        },
      );
    }

    case "call":
      // A method call to a nested closure (`receiver.name(...)`) emits a
      // property access on the receiver, since the closure is attached to the
      // receiver instance. The receiver is the first argument. When the
      // receiver is auto-referenced (a method whose `this` param is a
      // reference type like `&Wrapper`), wrap the first argument in a
      // reference object so it matches the expected `&Wrapper` type.
      if (
        (node.closureMethodCall === true || node.autoRefReceiver === true) &&
        node.args.length > 0
      ) {
        return andThen(
          generateJS(node.args[0]!, false, thisName, hoisted, outerThisName),
          (receiver) => {
            return map(
              generateArgs(
                node.args.slice(1),
                thisName,
                hoisted,
                outerThisName,
              ),
              (rest) => {
                if (node.closureMethodCall === true) {
                  return (
                    receiver +
                    "[" +
                    JSON.stringify(node.name) +
                    "](" +
                    rest +
                    ")"
                  );
                }
                const ref = "({ get: () => " + receiver + " })";
                return node.name + "(" + ref + (rest ? ", " + rest : "") + ")";
              },
            );
          },
        );
      }
      return andThen(
        generateArgs(node.args, thisName, hoisted, outerThisName),
        (args) => {
          return ok(node.name + "(" + args + ")");
        },
      );

    case "ref":
      // A reference is represented uniformly as a getter/setter object so it
      // can be passed around and dereferenced. Both immutable and mutable
      // references expose a `get` closure; a mutable reference additionally
      // exposes a `set` closure that writes back to the target. The closures
      // capture the target expression, so they work for arbitrary expressions
      // (re-evaluated on each access), not just plain variables.
      return map(
        generateJS(node.value, false, thisName, hoisted, outerThisName),
        (value) => {
          if (node.isMut === true) {
            return (
              "({ get: () => " +
              value +
              ", set: (v) => { " +
              value +
              " = v; } })"
            );
          }
          return "({ get: () => " + value + " })";
        },
      );

    case "deref":
      return map(
        generateJS(node.value, false, thisName, hoisted, outerThisName),
        (value) => {
          return value + ".get()";
        },
      );

    case "deref_assign":
      return andThen(
        generateJS(node.target, false, thisName, hoisted, outerThisName),
        (target) => {
          return map(
            generateJS(node.value, false, thisName, hoisted, outerThisName),
            (value) => {
              return target + ".set(" + value + ")";
            },
          );
        },
      );

    case "assign": {
      // The assignment target is a uniform ASTNode. A `member_access` target
      // emits a property write (`value["field"] = value`), except for a bare
      // scope reference `this.x` which emits the bare variable name
      // (`x = value`). An `identifier` target emits a plain variable
      // assignment (`x = value`).
      const target = node.target;
      if (target.kind === "member_access") {
        if (target.object.kind === "this") {
          // `this.x` is a bare scope reference (emits `x = value`) unless
          // `this` is a reference receiver, in which case it's a write
          // through the reference (`thisName.get()["x"] = value`).
          if (target.object.thisIsRef === true) {
            return map(
              generateJS(node.value, false, thisName, hoisted, outerThisName),
              (value) => {
                return (
                  thisName +
                  ".get()[" +
                  JSON.stringify(target.property) +
                  "] = " +
                  value
                );
              },
            );
          }
          return map(
            generateJS(node.value, false, thisName, hoisted, outerThisName),
            (value) => {
              return target.property + " = " + value;
            },
          );
        }
        return andThen(
          generateJS(target.object, false, thisName, hoisted, outerThisName),
          (object) => {
            return map(
              generateJS(node.value, false, thisName, hoisted, outerThisName),
              (value) => {
                // A `this.this^k.field` assignment that resolves to a Module
                // (top-level scope) field emits a plain variable assignment
                // (`field = value`), since Module's fields are the top-level
                // variables.
                if (target.moduleField === true) {
                  return target.property + " = " + value;
                }
                return (
                  object +
                  "[" +
                  JSON.stringify(target.property) +
                  "] = " +
                  value
                );
              },
            );
          },
        );
      }
      return map(
        generateJS(node.value, false, thisName, hoisted, outerThisName),
        (value) => {
          if (target.kind !== "identifier") {
            return "";
          }
          // A captured-field assignment (`counter = v` where `counter` is an
          // enclosing constructor's field) emits `outer["counter"] = v` so it
          // writes through the enclosing instance.
          if (target.capturedField === true && outerThisName !== undefined) {
            return (
              outerThisName + "[" + JSON.stringify(target.name) + "] = " + value
            );
          }
          return target.name + " = " + value;
        },
      );
    }

    case "array":
      return andThen(
        generateArgs(node.elements, thisName, hoisted, outerThisName),
        (elements) => {
          return ok("[" + elements + "]");
        },
      );

    case "index":
      return andThen(
        generateJS(node.object, false, thisName, hoisted, outerThisName),
        (object) => {
          return map(
            generateJS(node.index, false, thisName, hoisted, outerThisName),
            (index) => {
              return object + "[" + index + "]";
            },
          );
        },
      );

    case "struct_decl":
      // A struct declaration is a no-op at runtime (types are compile-time).
      return ok("");

    case "struct_init":
      return andThen(
        generateStructFields(node.fields, thisName, hoisted, outerThisName),
        (fields) => {
          return ok("({ " + fields + " })");
        },
      );

    case "tuple":
      return andThen(
        generateArgs(node.elements, thisName, hoisted, outerThisName),
        (elements) => {
          return ok("[" + elements + "]");
        },
      );

    case "tuple_index":
      return map(
        generateJS(node.object, false, thisName, hoisted, outerThisName),
        (object) => {
          return object + "[" + node.index + "]";
        },
      );

    case "if":
      return andThen(
        generateJS(node.condition, false, thisName, hoisted, outerThisName),
        (condition) => {
          return andThen(
            generateJS(
              node.thenBranch,
              false,
              thisName,
              hoisted,
              outerThisName,
            ),
            (thenBranch) => {
              if (node.elseBranch === undefined) {
                // No else: the `if` is used as a statement, so emit an if statement.
                return ok("if (" + condition + ") { " + thenBranch + "; }");
              }
              return map(
                generateJS(
                  node.elseBranch,
                  false,
                  thisName,
                  hoisted,
                  outerThisName,
                ),
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
        // Nested function declarations are hoisted to the top level (they are
        // global in Tuff), so emit them into the hoisted buffer and skip them
        // inline.
        if (stmt.kind === "fn_decl") {
          const fnResult = generateJS(
            stmt,
            false,
            thisName,
            hoisted,
            outerThisName,
          );
          if (!fnResult.ok) return fnResult;
          hoisted.push(fnResult.value);
          continue;
        }
        const stmtResult = generateJS(
          stmt,
          false,
          thisName,
          hoisted,
          outerThisName,
        );
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
        generateJS(node.condition, false, thisName, hoisted, outerThisName),
        (condition) => {
          return map(
            generateJS(node.body, false, thisName, hoisted, outerThisName),
            (body) => {
              return "while (" + condition + ") { " + body + "; }";
            },
          );
        },
      );
  }
}
